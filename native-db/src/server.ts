import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
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
 * therefore its row lock) alive across HTTP requests until the user Confirms
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

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

// --- Book: START TRANSACTION + SELECT ... FOR UPDATE, then hold the lock ------
app.post('/api/book', async (req, res) => {
  const user = String(req.body.user);
  const other = user === 'A' ? 'B' : 'A';

  if (sessions[user]) {
    return res.json({ status: 'locked' }); // already holding
  }

  addLog(user, 'pressed Book  ->  START TRANSACTION; SELECT * FROM seats WHERE id = 1 FOR UPDATE;', 'action');
  if (sessions[other]) {
    addLog(user, `is BLOCKED - waiting on the row lock held by User ${other}. MySQL will make this request wait.`, 'wait');
  }

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
      return res.json({ status: 'already_booked', bookedBy: seat.bookedBy });
    }

    sessions[user] = { conn, tx };
    addLog(user, 'acquired the row lock - transaction stays OPEN, awaiting Confirm', 'lock');
    return res.json({ status: 'locked' });
  } catch (err) {
    try { await conn.query('ROLLBACK'); } catch { /* ignore */ }
    conn.release();
    const message = err instanceof Error ? err.message : 'unknown error';
    addLog(user, `lock attempt failed: ${message}`, 'fail');
    return res.status(500).json({ status: 'error', message });
  }
});

// --- Confirm: UPDATE + COMMIT ------------------------------------------------
app.post('/api/confirm', async (req, res) => {
  const user = String(req.body.user);
  const s = sessions[user];
  if (!s) return res.status(400).json({ status: 'no_session' });

  try {
    await s.tx.update(seats).set({ status: 'booked', bookedBy: user }).where(eq(seats.id, SEAT_ID));
    await s.conn.query('COMMIT');
    s.conn.release();
    delete sessions[user];
    addLog(user, 'pressed Confirm  ->  UPDATE seats SET status = booked; COMMIT (durable - the lock is released)', 'commit');
    return res.json({ status: 'booked' });
  } catch (err) {
    await releaseSession(user, 'ROLLBACK');
    const message = err instanceof Error ? err.message : 'unknown error';
    return res.status(500).json({ status: 'error', message });
  }
});

// --- Cancel: ROLLBACK --------------------------------------------------------
app.post('/api/cancel', async (req, res) => {
  const user = String(req.body.user);
  if (!sessions[user]) return res.json({ status: 'idle' });
  await releaseSession(user, 'ROLLBACK');
  addLog(user, 'pressed Cancel  ->  ROLLBACK (lock released, seat still available)', 'rollback');
  return res.json({ status: 'idle' });
});

// --- Reset -------------------------------------------------------------------
app.post('/api/reset', async (_req, res) => {
  for (const user of Object.keys(sessions)) {
    await releaseSession(user, 'ROLLBACK');
  }
  await db.update(seats).set({ status: 'available', bookedBy: null }).where(eq(seats.id, SEAT_ID));
  log = [];
  addLog('system', 'Reset - seat is available again and all open transactions were rolled back.', 'info');
  return res.json({ status: 'ok' });
});

// --- State (polled by the UI) ------------------------------------------------
app.get('/api/state', async (_req, res) => {
  const rows = await db.select().from(seats).where(eq(seats.id, SEAT_ID));
  res.json({
    seat: rows[0],
    holders: { A: !!sessions.A, B: !!sessions.B },
    log,
  });
});

const PORT = Number(process.env.PORT) || 3000;
await ensureSeat();
app.listen(PORT, () => {
  console.log(`\n  ACID demo running -> http://localhost:${PORT}\n`);
});
