import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';
import { getDbCredentials } from './src/db/connection';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'mysql',
  dbCredentials: getDbCredentials(),
});
