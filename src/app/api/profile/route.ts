import { auth, handler, ok, fail, body } from '@/lib/api';
import { q, one } from '@/lib/db';
import { hashPassword, verifyPassword, writeAudit } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/* Self-service only: a user may change their own display name and password.
   Email is deliberately not editable here - it is both the sign-in identity
   and, via its domain, which tenant database and brand a session resolves
   to (see lib/brand.ts) - changing it is an administrative act, not a
   profile edit, and stays in Administration -> Users. */
export const PATCH = handler(async (req: Request) => {
  const u = await auth();
  const b = await body<{ name?: string; currentPassword?: string; newPassword?: string }>(req);

  const name = b.name?.trim();
  if (name !== undefined && !name) return fail(400, 'Name cannot be blank.');

  if (b.newPassword !== undefined) {
    if (!b.currentPassword) return fail(400, 'Enter your current password to set a new one.');
    if (b.newPassword.length < 8) return fail(400, 'New password must be at least 8 characters.');

    const row = await one<{ password_hash: string | null }>(
      `SELECT password_hash FROM users WHERE id = $1`, [u.id]);
    if (!row || !(await verifyPassword(b.currentPassword, row.password_hash)))
      return fail(401, 'Your current password is incorrect.');

    const newHash = await hashPassword(b.newPassword);
    await q(
      `UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`,
      [u.id, newHash]);
    await writeAudit({ actor: u, action: 'profile.password_change', objectType: 'user', objectId: u.id });
  }

  if (name !== undefined && name !== u.name) {
    await q(`UPDATE users SET full_name = $2, updated_at = now() WHERE id = $1`, [u.id, name]);
    await writeAudit({ actor: u, action: 'profile.update', objectType: 'user', objectId: u.id,
                       detail: `Name changed to "${name}"` });
  }

  return ok({ ok: true });
});
