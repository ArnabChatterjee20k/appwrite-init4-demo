import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import type { PoolConnection } from 'mysql2/promise';
import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import { eq } from 'drizzle-orm';
import { pool, db } from './db/index';
import { seats } from './db/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEAT_ID = 1;

/**
 * A "held" transaction. When a user presses Book we take a dedicated connection
 * out of the pool, START TRANSACTION, and grab the seat row with
 * SELECT ... FOR UPDATE. We keep this connection (and its open transaction, and
 * therefore its row lock) alive across messages until the user Confirms
 * (COMMIT) or Cancels (ROLLBACK).
 */
type HeldTx = { conn: PoolConnection; tx: MySql2Database };
const sessions: Record<string, HeldTx> = {}; // key: 'A' | 'B'

type LogEntry = { ts: number; actor: string; message: string; kind: string };
let log: LogEntry[] = [];
function addLog(actor: string, message: string, kind = 'info') {
  log.push({ ts: Date.now(), actor, message, kind });
  if (log.length > 80) log = log.slice(-80);
}

async function ensureSeat() {
  const rows = await db.select().from(seats).where(eq(seats.id, SEAT_ID));
  if (rows.length === 0) {
    await db.insert(seats).values({ id: SEAT_ID, label: 'A1', status: 'available' });
  }
}

async function releaseSession(user: string, verb: 'COMMIT' | 'ROLLBACK') {
  const s = sessions[user];
  if (!s) return;
  delete sessions[user];
  try {
    await s.conn.query(verb);
  } catch {
    /* connection may already be gone */
  } finally {
    s.conn.release();
  }
}

// --- Realtime plumbing -------------------------------------------------------
const app = express();
app.use(express.static(join(__dirname, '..', 'public')));

const server = createServer(app);
const wss = new WebSocketServer({ server });

async function currentState() {
  const rows = await db.select().from(seats).where(eq(seats.id, SEAT_ID));
  return {
    type: 'state' as const,
    seat: rows[0],
    holders: { A: !!sessions.A, B: !!sessions.B },
    log,
  };
}

/** Push the latest seat + holders + log to every connected client. */
async function broadcast() {
  const state = await currentState();
  const payload = JSON.stringify(state);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

// --- Book: START TRANSACTION + SELECT ... FOR UPDATE, then hold the lock ------
async function book(user: string) {
  const other = user === 'A' ? 'B' : 'A';

  if (sessions[user]) return { status: 'locked' as const }; // already holding

  addLog(user, 'pressed Book  ->  START TRANSACTION; SELECT * FROM seats WHERE id = 1 FOR UPDATE;', 'action');
  if (sessions[other]) {
    addLog(user, `is BLOCKED - waiting on the row lock held by User ${other}. MySQL will make this request wait.`, 'wait');
  }
  // Show the "pressed Book / BLOCKED" lines to everyone *before* we block on the lock.
  await broadcast();

  const conn = await pool.getConnection();
  const tx = drizzle(conn, { mode: 'default' });
  try {
    await conn.query('SET innodb_lock_wait_timeout = 30'); // safety valve: 30s
    await conn.query('START TRANSACTION');

    // This call BLOCKS at the DB level if another transaction holds the row.
    const rows = await tx.select().from(seats).where(eq(seats.id, SEAT_ID)).for('update');
    const seat = rows[0];

    if (seat.status === 'booked') {
      // The other user committed while we were blocked. The seat is taken.
      await conn.query('ROLLBACK');
      conn.release();
      addLog(user, `unblocked, but the seat is now booked by User ${seat.bookedBy}  ->  ROLLBACK`, 'fail');
      await broadcast();
      return { status: 'already_booked' as const, bookedBy: seat.bookedBy };
    }

    sessions[user] = { conn, tx };
    addLog(user, 'acquired the row lock - transaction stays OPEN, awaiting Confirm', 'lock');
    await broadcast();
    return { status: 'locked' as const };
  } catch (err) {
    try { await conn.query('ROLLBACK'); } catch { /* ignore */ }
    conn.release();
    const message = err instanceof Error ? err.message : 'unknown error';
    addLog(user, `lock attempt failed: ${message}`, 'fail');
    await broadcast();
    return { status: 'error' as const, message };
  }
}

// --- Confirm: UPDATE + COMMIT ------------------------------------------------
async function confirm(user: string) {
  const s = sessions[user];
  if (!s) return { status: 'no_session' as const };
  try {
    await s.tx.update(seats).set({ status: 'booked', bookedBy: user }).where(eq(seats.id, SEAT_ID));
    await s.conn.query('COMMIT');
    s.conn.release();
    delete sessions[user];
    addLog(user, 'pressed Confirm  ->  UPDATE seats SET status = booked; COMMIT (durable - the lock is released)', 'commit');
    await broadcast();
    return { status: 'booked' as const };
  } catch (err) {
    await releaseSession(user, 'ROLLBACK');
    const message = err instanceof Error ? err.message : 'unknown error';
    await broadcast();
    return { status: 'error' as const, message };
  }
}

// --- Cancel: ROLLBACK --------------------------------------------------------
async function cancel(user: string) {
  if (!sessions[user]) return { status: 'idle' as const };
  await releaseSession(user, 'ROLLBACK');
  addLog(user, 'pressed Cancel  ->  ROLLBACK (lock released, seat still available)', 'rollback');
  await broadcast();
  return { status: 'idle' as const };
}

// --- Reset -------------------------------------------------------------------
async function reset() {
  for (const user of Object.keys(sessions)) {
    await releaseSession(user, 'ROLLBACK');
  }
  await db.update(seats).set({ status: 'available', bookedBy: null }).where(eq(seats.id, SEAT_ID));
  log = [];
  addLog('system', 'Reset - seat is available again and all open transactions were rolled back.', 'info');
  await broadcast();
  return { status: 'ok' as const };
}

// --- WebSocket message routing ----------------------------------------------
wss.on('connection', async (ws) => {
  // Send the current state to the freshly connected client.
  ws.send(JSON.stringify(await currentState()));

  ws.on('message', async (raw) => {
    let msg: { type?: string; user?: string };
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const user = String(msg.user ?? '');
    switch (msg.type) {
      case 'book': {
        // Reply directly to the initiator so it can clear its "waiting" spinner,
        // even in the already_booked / error cases where it never holds the lock.
        const result = await book(user);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'bookResult', user, ...result }));
        }
        break;
      }
      case 'confirm':
        await confirm(user);
        break;
      case 'cancel':
        await cancel(user);
        break;
      case 'reset':
        await reset();
        break;
    }
  });
});

const PORT = Number(process.env.PORT) || 3000;
await ensureSeat();
server.listen(PORT, () => {
  console.log(`\n  ACID demo running -> http://localhost:${PORT}\n`);
});
