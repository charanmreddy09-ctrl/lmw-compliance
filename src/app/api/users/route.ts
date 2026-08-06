/* ===========================================================================
   USER ADMINISTRATION
   Logins are created by email address. A new account starts as "pending" and
   must be approved by the CFO or an administrator before it can sign in.
   =========================================================================== */
import { handler, ok, fail, auth, authWith, body, writeAudit } from '@/lib/api';
import { q, one, tx } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { randomBytes } from 'node:crypto';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  await authWith('users.manage');
  const users = await q(`
    SELECT u.id, u.email, u.full_name, u.role_id, r.name AS role_name, u.status,
           u.must_reset, u.last_login_at, u.created_at,
           (SELECT string_agg(CASE WHEN ue.entity_id = '*' THEN 'All entities' ELSE ue.entity_id END, ', ')
              FROM user_entities ue WHERE ue.user_id = u.id) AS entities,
           (SELECT bool_or(ue.can_review) FROM user_entities ue WHERE ue.user_id = u.id) AS can_review,
           (SELECT bool_or(ue.can_file) FROM user_entities ue WHERE ue.user_id = u.id) AS can_file,
           iu.email AS invited_by_email
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN users iu ON iu.id = u.invited_by
     WHERE u.deleted_at IS NULL
     ORDER BY r.name, u.full_name`);
  const [roles, entities] = await Promise.all([
    q(`SELECT id, name, description, permissions FROM roles ORDER BY name`),
    q(`SELECT id, short_name, name, country_code FROM entities WHERE deleted_at IS NULL ORDER BY country_code, name`),
  ]);
  return ok({ users, roles, entities });
});

export const POST = handler(async (req: Request) => {
  const u = await authWith('users.manage');
  const b = await body<{
    email: string; full_name: string; role_id: string;
    entities: string[]; can_file?: boolean; can_review?: boolean;
    approve?: boolean; password?: string;
  }>(req);

  const email = (b.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email))
    return fail(400, 'Enter a valid email address.');
  if (!b.full_name?.trim()) return fail(400, 'Full name is required.');
  if (!b.role_id) return fail(400, 'Choose a role.');
  if (!b.entities?.length) return fail(400, 'Assign at least one entity, or "All entities".');

  const exists = await one(`SELECT id FROM users WHERE lower(email) = $1 AND deleted_at IS NULL`, [email]);
  if (exists) return fail(409, 'A user with that email address already exists.');

  const role = await one(`SELECT id FROM roles WHERE id = $1`, [b.role_id]);
  if (!role) return fail(400, 'That role does not exist.');

  /* An initial password is set so the account is usable immediately once
     approved. must_reset flags that it should be changed at first sign-in. */
  const initial = b.password?.trim() || randomBytes(6).toString('base64url') + 'A1!';
  const hash = await hashPassword(initial);
  const token = randomBytes(24).toString('hex');

  const created = await tx(async c => {
    const row = await c.query<{ id: string }>(
      `INSERT INTO users (email, full_name, role_id, password_hash, status, invited_by, invite_token, must_reset)
       VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE) RETURNING id`,
      [email, b.full_name.trim(), b.role_id, hash,
       b.approve ? 'active' : 'pending', u.id, token]);
    for (const ent of b.entities) {
      await c.query(
        `INSERT INTO user_entities (user_id, entity_id, can_file, can_review)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [row.rows[0].id, ent, !!b.can_file, !!b.can_review]);
    }
    return row.rows[0].id;
  });

  await writeAudit({ actor: u, action: 'user.create', objectType: 'user', objectId: created,
    detail: `${email} as ${b.role_id}${b.approve ? ' (approved immediately)' : ' (pending approval)'}` });

  return ok({
    id: created, email,
    status: b.approve ? 'active' : 'pending',
    initialPassword: initial,
    note: b.approve
      ? 'Account is active. Share the initial password securely; the user will be asked to change it.'
      : 'Account created and is awaiting approval. Approve it from the Users tab to enable sign-in.',
  });
});

export const PATCH = handler(async (req: Request) => {
  const u = await authWith('users.manage');
  const b = await body<{
    id: string; status?: 'pending' | 'active' | 'disabled'; role_id?: string;
    full_name?: string; entities?: string[]; can_file?: boolean; can_review?: boolean;
    resetPassword?: boolean;
  }>(req);
  if (!b.id) return fail(400, 'User id is required.');

  const target = await one<{ email: string; status: string }>(
    `SELECT email, status FROM users WHERE id = $1 AND deleted_at IS NULL`, [b.id]);
  if (!target) return fail(404, 'User not found.');
  if (b.id === u.id && b.status && b.status !== 'active')
    return fail(400, 'You cannot disable your own account.');

  let newPassword: string | null = null;
  await tx(async c => {
    if (b.resetPassword) {
      newPassword = randomBytes(6).toString('base64url') + 'A1!';
      await c.query(`UPDATE users SET password_hash = $2, must_reset = TRUE WHERE id = $1`,
        [b.id, await hashPassword(newPassword)]);
    }
    await c.query(
      `UPDATE users SET status = COALESCE($2, status), role_id = COALESCE($3, role_id),
                        full_name = COALESCE($4, full_name)
        WHERE id = $1`, [b.id, b.status ?? null, b.role_id ?? null, b.full_name ?? null]);

    if (b.entities) {
      await c.query(`DELETE FROM user_entities WHERE user_id = $1`, [b.id]);
      for (const ent of b.entities) {
        await c.query(
          `INSERT INTO user_entities (user_id, entity_id, can_file, can_review)
           VALUES ($1,$2,$3,$4)`, [b.id, ent, !!b.can_file, !!b.can_review]);
      }
    }
  });

  await writeAudit({ actor: u, action: 'user.update', objectType: 'user', objectId: b.id,
    detail: `${target.email}: ${JSON.stringify({ ...b, id: undefined })}` });
  return ok({ ok: true, newPassword });
});

export const DELETE = handler(async (req: Request) => {
  const u = await authWith('users.manage');
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail(400, 'User id is required.');
  if (id === u.id) return fail(400, 'You cannot remove your own account.');

  const target = await one<{ email: string }>(`SELECT email FROM users WHERE id = $1`, [id]);
  if (!target) return fail(404, 'User not found.');

  await q(`UPDATE users SET deleted_at = now(), status = 'disabled' WHERE id = $1`, [id]);
  await writeAudit({ actor: u, action: 'user.delete', objectType: 'user', objectId: id, detail: target.email });
  return ok({ ok: true });
});
