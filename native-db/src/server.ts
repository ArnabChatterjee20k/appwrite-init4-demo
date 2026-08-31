import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { PoolClient } from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { pool, db } from './db/index';
import { seats } from './db/schema';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEAT_ID = 1;

/**
 * A "held" transaction. When a user presses Book we take a dedicated client out
 * of the pool, BEGIN, and grab the seat row with SELECT ... FOR UPDATE. We keep
 * this client (and its open transaction, and therefore its row lock) alive
 * across HTTP requests until the user Confirms (COMMIT) or Cancels (ROLLBACK).
 */
type HeldTx = { client: PoolClient; tx: NodePgDatabase };
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
    await s.client.query(verb);
  } catch {
    /* connection may already be gone */
  } finally {
    s.client.release();
  }
}

const app = express();
app.use(express.json());
app.use(express.static(join(__dirname, '..', 'public')));

// --- Book: BEGIN + SELECT ... FOR UPDATE, then hold the lock open ------------
app.post('/api/book', async (req, res) => {
  const user = String(req.body.user);
  const other = user === 'A' ? 'B' : 'A';

  if (sessions[user]) {
    return res.json({ status: 'locked' }); // already holding
  }

  addLog(user, 'pressed Book  ->  BEGIN; SELECT * FROM seats WHERE id = 1 FOR UPDATE;', 'action');
  if (sessions[other]) {
    addLog(user, `is BLOCKED — waiting on the row lock held by User ${other}. Postgres will make this request wait.`, 'wait');
  }

  const client = await pool.connect();
  const tx = drizzle(client);
  try {
    await client.query('BEGIN');
    await client.query('SET lock_timeout = 30000'); // safety valve: 30s

    // This call BLOCKS at the DB level if another transaction holds the row.
    const rows = await tx.select().from(seats).where(eq(seats.id, SEAT_ID)).for('update');
    const seat = rows[0];

    if (seat.status === 'booked') {
      // The other user committed while we were blocked. The seat is taken.
      await client.query('ROLLBACK');
      client.release();
      addLog(user, `unblocked, but the seat is now booked by User ${seat.bookedBy}  ->  ROLLBACK`, 'fail');
      return res.json({ status: 'already_booked', bookedBy: seat.bookedBy });
    }

    sessions[user] = { client, tx };
    addLog(user, 'acquired the row lock - transaction stays OPEN, awaiting Confirm', 'lock');
    return res.json({ status: 'locked' });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    client.release();
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
    await s.client.query('COMMIT');
    s.client.release();
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
  addLog('system', 'Reset — seat is available again and all open transactions were rolled back.', 'info');
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
