/* Pending due-date change proposals raised by the sync check. Nothing here
   was applied automatically — GET lists what's awaiting a decision, PATCH
   records that decision (approve writes the new due_day/due_month onto the
   compliance; reject just closes the proposal out). */
import { handler, ok, fail, authWith, body, writeAudit } from '@/lib/api';
import { q, one, tx } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  await authWith('duedate.manage');
  const rows = await q(`
    SELECT ddc.id, ddc.old_due_date, ddc.new_due_date, ddc.reason, ddc.changed_at,
           c.id AS compliance_id, c.code, c.title, c.country_code
      FROM due_date_changes ddc
      JOIN compliances c ON c.id = ddc.compliance_id
     WHERE ddc.status = 'pending'
     ORDER BY ddc.changed_at DESC`);
  return ok({ pending: rows });
});

export const PATCH = handler(async (req: Request) => {
  const u = await authWith('duedate.manage');
  const b = await body<{ id: number; action: 'approve' | 'reject' }>(req);
  if (!b.id) return fail(400, 'Change id is required.');
  if (b.action !== 'approve' && b.action !== 'reject') return fail(400, 'Action must be approve or reject.');

  const row = await one<{ compliance_id: string; new_due_date: string; status: string; code: string; title: string }>(`
    SELECT ddc.compliance_id, ddc.new_due_date, ddc.status, c.code, c.title
      FROM due_date_changes ddc JOIN compliances c ON c.id = ddc.compliance_id
     WHERE ddc.id = $1`, [b.id]);
  if (!row) return fail(404, 'Proposed change not found.');
  if (row.status !== 'pending') return fail(409, 'This proposal has already been decided.');

  await tx(async c => {
    if (b.action === 'approve') {
      const d = new Date(row.new_due_date);
      await c.query(
        `UPDATE compliances SET due_day = $2, due_month = $3 WHERE id = $1`,
        [row.compliance_id, d.getUTCDate(), d.getUTCMonth() + 1]);
      await c.query(`UPDATE due_date_changes SET status = 'applied', changed_by = $2 WHERE id = $1`, [b.id, u.id]);
    } else {
      await c.query(`UPDATE due_date_changes SET status = 'rejected', changed_by = $2 WHERE id = $1`, [b.id, u.id]);
    }
  });

  await writeAudit({
    actor: u, action: `duedate.${b.action}`, objectType: 'compliance', objectId: row.compliance_id,
    detail: `${row.code} — ${row.title}: proposed due date ${row.new_due_date} ${b.action === 'approve' ? 'applied' : 'rejected'}.`,
  });
  return ok({ ok: true });
});
