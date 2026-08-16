/* Shared API plumbing: consistent JSON errors, session guards, body parsing. */
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { HttpError, getSession, writeAudit, decodeSessionToken, SESSION_COOKIE } from './auth';
import { runWithDbEnvVar, DEFAULT_DB_ENV_VAR } from './db';
import { can, type Permission, type SessionUser } from './rbac';

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/** Wrap a handler so an unexpected throw never returns an HTML error page,
    and so every query the handler makes runs against the signed-in user's
    own tenant database. The login route is the one exception - it has no
    session cookie yet, so it resolves and sets its own tenant context from
    the submitted email (see authenticate() in lib/auth.ts) and this falls
    back to the default database for the outer request, which is fine since
    that route makes no other queries outside of its own explicit scope. */
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<Response>
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    const token = cookies().get(SESSION_COOKIE)?.value;
    const decoded = token ? await decodeSessionToken(token) : null;
    const dbEnvVar = decoded?.dbEnvVar ?? DEFAULT_DB_ENV_VAR;
    try {
      return await runWithDbEnvVar(dbEnvVar, () => fn(...args));
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.message);
      const msg = err instanceof Error ? err.message : 'Unexpected server error';
      // Surface setup problems clearly instead of a blank 500.
      if (/DATABASE_URL|AUTH_SECRET/.test(msg)) return fail(500, msg);
      if (/relation .* does not exist/i.test(msg))
        return fail(500, 'The database schema is not installed. Run: npm run db:setup');
      if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(msg))
        return fail(503, 'Cannot reach the database. Check DATABASE_URL.');

      /* Turn Postgres constraint and cast errors into something the user can
         act on. Without this a bad id or a repeated code surfaces as a 500. */
      const pg = err as { code?: string; constraint?: string; detail?: string; column?: string };
      switch (pg.code) {
        case '22P02':   // invalid text representation, e.g. a malformed uuid
        case '22007':   // invalid datetime format
        case '22008':   // datetime field overflow
          return fail(400, 'One of the values supplied is not in a valid format.');
        case '23505': { // unique violation
          const what = /_code_key$/.test(pg.constraint ?? '') ? 'code'
            : /_email_key$/.test(pg.constraint ?? '') ? 'email address'
            : /obligations_/.test(pg.constraint ?? '') ? 'compliance, entity and period combination'
            : 'value';
          return fail(409, `That ${what} already exists. Use a different one, or edit the existing record.`);
        }
        case '23503':   // foreign key violation
          return fail(400, 'A referenced record does not exist. Create it first, then retry.');
        case '23514':   // check constraint
          return fail(400, 'That value is not one of the options this field accepts.');
        case '23502':   // not null violation
          return fail(400, `"${pg.column ?? 'A required field'}" is required.`);
        case '42703':   // undefined column
        case '42P01':   // undefined table
          return fail(500, 'The database schema is out of date. Run: npm run db:setup');
        default:
          break;
      }

      console.error('[api]', err);
      return fail(500, msg);
    }
  };
}

export async function auth(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new HttpError(401, 'Not signed in.');
  return s;
}

export async function authWith(perm: Permission): Promise<SessionUser> {
  const s = await auth();
  if (!can(s, perm)) throw new HttpError(403, 'Your role does not permit this action.');
  return s;
}

/** Entity ids this user may read; null means every entity. */
export function entityFilter(u: SessionUser): string[] | null {
  return u.entities.includes('*') ? null : u.entities;
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

export { writeAudit };
