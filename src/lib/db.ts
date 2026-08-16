/* Postgres access. One pooled client per tenant database, safe for serverless
   reuse. Which tenant a request talks to is carried via AsyncLocalStorage
   (see runWithDbEnvVar) rather than threaded through every call site - it's
   set once, at the edge of a request (see lib/api.ts's handler() and the
   login route), and every q()/one()/tx() call below it automatically picks
   up the right pool. Falls back to DATABASE_URL when no tenant context is
   active (scripts, cron jobs, and any request that hasn't set one). */
import { Pool, type QueryResultRow } from 'pg';
import { AsyncLocalStorage } from 'async_hooks';

export const DEFAULT_DB_ENV_VAR = 'DATABASE_URL';

const tenantAls = new AsyncLocalStorage<string>();

/** Run fn with a specific tenant database active for its entire duration
    (including everything it awaits). Nested calls override the outer tenant
    only for their own extent, then it reverts - safe to nest. */
export function runWithDbEnvVar<T>(envVar: string, fn: () => Promise<T>): Promise<T> {
  return tenantAls.run(envVar, fn);
}

export function currentDbEnvVar(): string {
  return tenantAls.getStore() ?? DEFAULT_DB_ENV_VAR;
}

declare global {
  // eslint-disable-next-line no-var
  var __sgcmpPools: Map<string, Pool> | undefined;
}

function makePool(envVar: string): Pool {
  const connectionString = process.env[envVar];
  if (!connectionString) {
    throw new Error(
      `${envVar} is not set. Copy .env.example to .env.local and add your Postgres connection string.`
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
  if (!global.__sgcmpPools) global.__sgcmpPools = new Map();
  const envVar = currentDbEnvVar();
  let p = global.__sgcmpPools.get(envVar);
  if (!p) {
    p = makePool(envVar);
    global.__sgcmpPools.set(envVar, p);
  }
  return p;
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
