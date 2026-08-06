/* Postgres access. A single pooled client, safe for serverless reuse. */
import { Pool, type QueryResultRow } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var __sgcmpPool: Pool | undefined;
}

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local and add your Postgres connection string.'
    );
  }
  const needsSsl = !/localhost|127\.0\.0\.1/.test(connectionString);
  return new Pool({
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
}

export function pool(): Pool {
  if (!global.__sgcmpPool) global.__sgcmpPool = makePool();
  return global.__sgcmpPool;
}

export async function q<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool().query<T>(sql, params as never[]);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows.length ? rows[0] : null;
}

/** Run a set of statements inside a transaction. */
export async function tx<T>(fn: (c: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function dbReady(): Promise<boolean> {
  try {
    await q('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
