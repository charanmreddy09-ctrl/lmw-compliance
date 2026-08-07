/* ===========================================================================
   AUTHENTICATION
   Email + password, bcrypt hashes, signed HttpOnly session cookie (JWT via
   jose so it also verifies inside Edge middleware). No third-party auth
   service, so the platform runs with a single database credential.
   =========================================================================== */
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { q, one } from './db';
import type { Permission, SessionUser } from './rbac';

const COOKIE = 'sgcmp_session';
const MAX_AGE = 60 * 60 * 12; // 12 hours

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 24) {
    throw new Error(
      'AUTH_SECRET is missing or too short. Add a long random string to .env.local ' +
      '(generate with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))").'
    );
  }
  return new TextEncoder().encode(s);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

export async function createSessionCookie(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function readToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = MAX_AGE;

type UserRow = {
  id: string; email: string; full_name: string; role_id: string;
  role_name: string; permissions: Permission[]; status: string;
};

/** Load the signed-in user together with permissions and entity scope. */
export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const userId = await readToken(token);
  if (!userId) return null;

  const row = await one<UserRow>(
    `SELECT u.id, u.email, u.full_name, u.role_id, u.status,
            r.name AS role_name, r.permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1 AND u.deleted_at IS NULL AND u.status = 'active'`,
    [userId]
  );
  if (!row) return null;

  const scope = await q<{ entity_id: string; can_file: boolean; can_review: boolean }>(
    `SELECT entity_id, can_file, can_review FROM user_entities WHERE user_id = $1`,
    [userId]
  );

  const categoryRows = await q<{ category_id: string }>(
    `SELECT category_id FROM user_categories WHERE user_id = $1`, [userId]);

  // Active delegations widen review scope without changing the user's role.
  const delegated = await q<{ scope_type: string; scope_value: string | null }>(
    `SELECT scope_type, scope_value FROM delegations
      WHERE to_user_id = $1 AND is_active
        AND valid_from <= CURRENT_DATE
        AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)`,
    [userId]
  );

  const permissions = new Set<Permission>(row.permissions || []);
  const canReview = new Set(scope.filter(s => s.can_review).map(s => s.entity_id));

  if (delegated.length) {
    permissions.add('compliance.review');
    for (const d of delegated) {
      if (d.scope_type === 'all') { canReview.add('*'); continue; }
      if (d.scope_type === 'entity' && d.scope_value) { canReview.add(d.scope_value); continue; }
      if (d.scope_type === 'country' && d.scope_value) {
        const ents = await q<{ id: string }>(
          `SELECT id FROM entities WHERE country_code = $1 AND deleted_at IS NULL`, [d.scope_value]);
        ents.forEach(e => canReview.add(e.id));
      }
    }
  }

  return {
    id: row.id,
    email: row.email,
    name: row.full_name,
    role: row.role_id,
    roleName: row.role_name,
    permissions: [...permissions],
    entities: scope.map(s => s.entity_id),
    canFile: scope.filter(s => s.can_file).map(s => s.entity_id),
    canReview: [...canReview],
    allowedCategories: categoryRows.length ? categoryRows.map(c => c.category_id) : null,
  };
}

/** Whether some OTHER user (not the caller) actually has review/file rights
    on an entity — via their own user_entities scope or an active delegation.
    Used before an obligation is assigned to someone, so "assigned reviewer"
    can never point at a person who won't see the item in their own queue. */
async function userHasEntityRight(userId: string, entityId: string, right: 'can_review' | 'can_file', perm: Permission): Promise<boolean> {
  const row = await one<{ ok: boolean }>(
    `SELECT EXISTS (
        SELECT 1 FROM user_entities ue
        JOIN users u ON u.id = ue.user_id AND u.status = 'active' AND u.deleted_at IS NULL
        JOIN roles r ON r.id = u.role_id
       WHERE ue.user_id = $1
         AND (ue.entity_id = $2 OR ue.entity_id = '*')
         AND ue.${right}
         AND r.permissions @> $3::jsonb
     ) OR (
       $4 = 'can_review' AND EXISTS (
        SELECT 1 FROM delegations d
        LEFT JOIN entities e ON e.id = $2
       WHERE d.to_user_id = $1 AND d.is_active
         AND d.valid_from <= CURRENT_DATE
         AND (d.valid_to IS NULL OR d.valid_to >= CURRENT_DATE)
         AND (d.scope_type = 'all'
              OR (d.scope_type = 'entity' AND d.scope_value = $2)
              OR (d.scope_type = 'country' AND d.scope_value = e.country_code))
     )) AS ok`,
    [userId, entityId, JSON.stringify([perm]), right]);
  return !!row?.ok;
}

export async function userCanReviewEntity(userId: string, entityId: string): Promise<boolean> {
  return userHasEntityRight(userId, entityId, 'can_review', 'compliance.review');
}

export async function userCanFileEntity(userId: string, entityId: string): Promise<boolean> {
  return userHasEntityRight(userId, entityId, 'can_file', 'compliance.file');
}

/** Throwing guard for API routes. */
export async function requireSession(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) throw new HttpError(401, 'Your session has expired. Please sign in again.');
  return s;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function authenticate(email: string, password: string): Promise<
  { ok: true; userId: string } | { ok: false; reason: string }
> {
  const row = await one<{ id: string; password_hash: string | null; status: string }>(
    `SELECT id, password_hash, status FROM users
      WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
    [email.trim()]
  );
  if (!row) return { ok: false, reason: 'No account exists for that email address.' };
  if (row.status === 'pending')
    return { ok: false, reason: 'This account is awaiting approval by the CFO or an administrator.' };
  if (row.status === 'disabled')
    return { ok: false, reason: 'This account has been disabled. Contact your administrator.' };
  if (!(await verifyPassword(password, row.password_hash)))
    return { ok: false, reason: 'The email address or password is incorrect.' };

  await q(`UPDATE users SET last_login_at = now() WHERE id = $1`, [row.id]);
  return { ok: true, userId: row.id };
}

export async function writeAudit(opts: {
  actor?: SessionUser | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  detail?: string;
  meta?: unknown;
}): Promise<void> {
  await q(
    `INSERT INTO audit_log (actor_id, actor_email, actor_role, action, object_type, object_id, detail, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      opts.actor?.id ?? null,
      opts.actor?.email ?? 'system',
      opts.actor?.role ?? null,
      opts.action,
      opts.objectType,
      opts.objectId ?? null,
      opts.detail ?? null,
      opts.meta ? JSON.stringify(opts.meta) : null,
    ]
  );
}
