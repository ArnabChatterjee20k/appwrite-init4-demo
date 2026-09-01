import 'dotenv/config';

/**
 * Parse DATABASE_URL into a mysql2-friendly config.
 *
 * Appwrite's connection string ends with `?ssl=true`, but mysql2 requires `ssl`
 * to be an OBJECT, not a boolean — so we translate it here and hand back a
 * structured config that both the app pool and Drizzle Kit can use.
 */
export function getDbCredentials() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env and add your Appwrite MySQL connection string.');
  }

  const parsed = new URL(url);
  const wantsSsl = parsed.searchParams.has('ssl') && parsed.searchParams.get('ssl') !== 'false';

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
    // If the cert chain fails to verify against system CAs, set this to
    // { rejectUnauthorized: false } (fine for a local demo).
    ssl: wantsSsl ? { rejectUnauthorized: true } : undefined,
  };
}
