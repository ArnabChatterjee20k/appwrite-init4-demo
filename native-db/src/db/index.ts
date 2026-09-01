import 'dotenv/config';
import mysql from 'mysql2/promise';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from './schema';
import { getDbCredentials } from './connection';

// A small pool: we hold a dedicated connection open for each user that is
// mid-booking (its transaction stays open until Confirm/Cancel), so we need
// room for both holders plus the state-polling queries.
export const pool = mysql.createPool({
  ...getDbCredentials(),
  connectionLimit: 10,
});

export const db = drizzle(pool, { schema, mode: 'default' });
export { schema };
