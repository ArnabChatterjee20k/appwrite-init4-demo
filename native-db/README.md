# Appwrite Postgres + Drizzle — ACID Row-Locking Demo

A tiny, visual proof that Appwrite Postgres is **real Postgres**: two users try to book
the same seat, and the second one physically **blocks** until the first commits or rolls
back. The blocking isn't faked in JavaScript — it's Postgres holding a row lock inside an
open transaction, driven through **Drizzle ORM**.

## What it shows

- `db.transaction`-style held transaction with a real **row lock** (`SELECT … FOR UPDATE`)
- **Atomicity**: Confirm = `COMMIT` (durable), Cancel = `ROLLBACK` (as if it never happened)
- **Isolation**: while User A holds the lock, User B's Book request genuinely waits
- A live transaction log showing the actual SQL, plus a Reset button

## How it works

Pressing **Book** checks out a dedicated connection from the pool, runs `BEGIN` and
`SELECT * FROM seats WHERE id = 1 FOR UPDATE`, and **keeps that transaction open across
requests**. The lock is released only on **Confirm** (`COMMIT`) or **Cancel** (`ROLLBACK`).
The other user's Book runs the same `FOR UPDATE` and blocks at the database until then.

## Run it

```bash
cp .env.example .env        # then paste your Appwrite Postgres connection string
npm install
npm run db:push             # create the `seats` table via Drizzle Kit
npm run dev                 # http://localhost:3000
```

Open the page, press **Book** on one side, then **Book** on the other — watch it hang.
Then press **Confirm** or **Cancel** on the first side and watch the second unblock.

## Files

- `src/db/schema.ts` — the Drizzle schema (the part people screenshot)
- `src/server.ts` — the held-transaction / row-lock logic
- `public/index.html` — the two-pane UI + transaction log
