/* CFO delegation of review authority. */
import { handler, ok, fail, auth, authWith, body, writeAudit } from '@/lib/api';
import { q, one } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  await auth();
  const rows = await q(`
    SELECT d.id, d.scope_type, d.scope_value, d.valid_from, d.valid_to, d.note, d.is_active,
           d.created_at,
           fu.full_name AS from_name, fu.email AS from_email,
           tu.full_name AS to_name, tu.email AS to_email, tu.id AS to_user_id,
           r.name AS to_role
      FROM delegations d
      JOIN users fu ON fu.id = d.from_user_id
      JOIN users tu ON tu.id = d.to_user_id
      JOIN roles r ON r.id = tu.role_id
     ORDER BY d.is_active DESC, d.created_at DESC`);

  const [candidates, entities, countries] = await Promise.all([
    q(`SELECT u.id, u.full_name, u.email, r.name AS role_name FROM users u
        JOIN roles r ON r.id = u.role_id
       WHERE u.status = 'active' AND u.deleted_at IS NULL
         AND u.role_id IN ('CFO_OFFICE','COUNTRY_HEAD','REVIEWER','ADMIN')
       ORDER BY r.name, u.full_name`),
    q(`SELECT id, short_name, country_code FROM entities WHERE deleted_at IS NULL ORDER BY country_code, short_name`),
    q(`SELECT code, name FROM countries ORDER BY name`),
  ]);
  return ok({ delegations: rows, candidates, entities, countries });
});

export const POST = handler(async (req: Request) => {
  const u = await authWith('delegation.manage');
  const b = await body<{
    to_user_id: string; scope_type: 'all' | 'country' | 'entity' | 'category';
    scope_value?: string; valid_from?: string; valid_to?: string; note?: string;
  }>(req);

  if (!b.to_user_id) return fail(400, 'Choose the person who will review on your behalf.');
  if (!['all', 'country', 'entity', 'category'].includes(b.scope_type))
    return fail(400, 'Choose a valid delegation scope.');
  if (b.scope_type !== 'all' && !b.scope_value)
    return fail(400, 'Select the country, entity or category being delegated.');
  if (b.to_user_id === u.id) return fail(400, 'You cannot delegate review authority to yourself.');

  const target = await one<{ full_name: string }>(
    `SELECT full_name FROM users WHERE id = $1 AND status = 'active' AND deleted_at IS NULL`, [b.to_user_id]);
  if (!target) return fail(404, 'That user is not active.');

  if (b.valid_to && b.valid_from && b.valid_to < b.valid_from)
    return fail(400, 'The end date cannot be before the start date.');

  const row = await one<{ id: string }>(`
    INSERT INTO delegations (from_user_id, to_user_id, scope_type, scope_value,
        valid_from, valid_to, note, created_by)
    VALUES ($1,$2,$3,$4,COALESCE($5::date, CURRENT_DATE),$6,$7,$1) RETURNING id`,
    [u.id, b.to_user_id, b.scope_type, b.scope_value ?? null,
     b.valid_from ?? null, b.valid_to ?? null, b.note ?? null]);

  await q(`INSERT INTO notifications (user_id, kind, title, body, link, severity, is_popup)
           VALUES ($1,'delegation','Review authority delegated to you',$2,'/reviews','info',TRUE)`,
    [b.to_user_id,
     `${u.name} has delegated review authority to you (${b.scope_type}${b.scope_value ? ': ' + b.scope_value : ''}).`]);

  await writeAudit({ actor: u, action: 'delegation.create', objectType: 'delegation', objectId: row!.id,
    detail: `To ${target.full_name}, scope ${b.scope_type} ${b.scope_value ?? ''}` });
  return ok({ id: row!.id });
});

export const DELETE = handler(async (req: Request) => {
  const u = await authWith('delegation.manage');
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return fail(400, 'Delegation id is required.');
  await q(`UPDATE delegations SET is_active = FALSE WHERE id = $1`, [id]);
  await writeAudit({ actor: u, action: 'delegation.revoke', objectType: 'delegation', objectId: id, detail: 'Revoked' });
  return ok({ ok: true });
});
