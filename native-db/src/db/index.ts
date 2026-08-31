import 'dotenv/config';
import pkg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const { Pool } = pkg;

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and add your Appwrite Postgres connection string.');
}

// A small pool: we hold a dedicated connection open for each user that is
// mid-booking (its transaction stays open until Confirm/Cancel), so we need
// room for both holders plus the state-polling queries.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

export const db = drizzle(pool, { schema });
export { schema };
