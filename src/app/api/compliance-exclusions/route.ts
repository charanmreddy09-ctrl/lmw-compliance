/* ===========================================================================
   COMPLIANCE EXCLUSIONS — Reviewer-only "does not apply to this entity"
   ---------------------------------------------------------------------------
   Excluding a compliance for an entity flips every one of its non-approved
   obligations (past, current and future — all already generated) to status
   'Not Applicable'. Every score/dashboard/register query already excludes
   that status, so this is the only write needed to pull it out of the
   applicable and future counts. Re-including reverts them to 'Not Started'
   so they re-enter the normal workflow.
   =========================================================================== */
import { handler, ok, fail, authWith, body, writeAudit } from '@/lib/api';
import { q, one, tx } from '@/lib/db';
import { HttpError } from '@/lib/auth';
import { canReviewEntity } from '@/lib/rbac';
import type { SessionUser } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

/* Holding compliance.review is not the same as holding it over a given
   entity. Excluding a compliance flips that entity's obligations to Not
   Applicable, which removes them from the score outright — so without an
   entity check a reviewer scoped to one country could quietly lift another
   country's obligations out of the group figure. Every mutation below is
   gated on review rights for the entity actually being changed. */
function guardEntity(u: SessionUser, entityId: string) {
  if (!canReviewEntity(u, entityId)) {
    throw new HttpError(403, 'You do not have review authority for this entity.');
  }
}

export const GET = handler(async (req: Request) => {
  const u = await authWith('compliance.review');
  const p = new URL(req.url).searchParams;
  const entityId = p.get('entity_id');

  /* Scoped to what this reviewer actually covers. The list previously
     returned every exclusion in the group to anyone holding compliance.review
     regardless of their entity scope, which is the same visibility leak the
     register and the review queue already guard against. */
  const vals: unknown[] = [];
  const clauses: string[] = [];
  if (entityId) { vals.push(entityId); clauses.push(`ce.entity_id = $${vals.length}`); }
  if (!u.entities.includes('*')) { vals.push(u.entities); clauses.push(`ce.entity_id = ANY($${vals.length})`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = await q(`
    SELECT ce.id, ce.compliance_id, ce.entity_id, ce.reason, ce.excluded_at,
           c.code, c.title, e.short_name AS entity_name, ub.full_name AS excluded_by
      FROM compliance_exclusions ce
      JOIN compliances c ON c.id = ce.compliance_id
      JOIN entities e ON e.id = ce.entity_id
      LEFT JOIN users ub ON ub.id = ce.excluded_by
      ${where}
     ORDER BY ce.excluded_at DESC`, vals);
  return ok({ exclusions: rows, canManage: !!u });
});

export const POST = handler(async (req: Request) => {
  const u = await authWith('compliance.review');
  const b = await body<{ compliance_id: string; entity_id: string; reason?: string }>(req);
  if (!b.compliance_id || !b.entity_id) return fail(400, 'A compliance and an entity are required.');

  const comp = await one<{ title: string }>(`SELECT title FROM compliances WHERE id = $1`, [b.compliance_id]);
  if (!comp) return fail(404, 'Compliance not found.');
  const ent = await one<{ short_name: string }>(`SELECT short_name FROM entities WHERE id = $1`, [b.entity_id]);
  if (!ent) return fail(404, 'Entity not found.');
  guardEntity(u, b.entity_id);

  const affected = await tx(async c => {
    const existing = await c.query(
      `SELECT id FROM compliance_exclusions WHERE compliance_id = $1 AND entity_id = $2`,
      [b.compliance_id, b.entity_id]);
    if (existing.rowCount) throw new HttpError(409, 'This compliance is already marked not applicable for this entity.');

    await c.query(
      `INSERT INTO compliance_exclusions (compliance_id, entity_id, reason, excluded_by)
       VALUES ($1,$2,$3,$4)`,
      [b.compliance_id, b.entity_id, b.reason ?? null, u.id]);

    /* Approved filings are genuine history — leave them alone. Everything
       else (not yet due, overdue, mid-review) stops being tracked. */
    const upd = await c.query<{ id: string }>(
      `UPDATE obligations SET status = 'Not Applicable', workflow_stage = 'closed'
        WHERE compliance_id = $1 AND entity_id = $2 AND deleted_at IS NULL
          AND status <> 'Approved' AND status <> 'Not Applicable'
        RETURNING id`,
      [b.compliance_id, b.entity_id]);
    return upd.rowCount;
  });

  await writeAudit({
    actor: u, action: 'compliance.exclude', objectType: 'compliance', objectId: b.compliance_id,
    detail: `${comp.title} marked not applicable for ${ent.short_name}${b.reason ? ` — ${b.reason}` : ''} (${affected} obligation${affected === 1 ? '' : 's'} affected)`,
  });
  return ok({ ok: true, affected });
});

export const DELETE = handler(async (req: Request) => {
  const u = await authWith('compliance.review');
  const p = new URL(req.url).searchParams;
  const complianceId = p.get('compliance_id');
  const entityId = p.get('entity_id');
  if (!complianceId || !entityId) return fail(400, 'A compliance and an entity are required.');

  const row = await one<{ title: string; short_name: string }>(
    `SELECT c.title, e.short_name
       FROM compliance_exclusions ce
       JOIN compliances c ON c.id = ce.compliance_id
       JOIN entities e ON e.id = ce.entity_id
      WHERE ce.compliance_id = $1 AND ce.entity_id = $2`, [complianceId, entityId]);
  if (!row) return fail(404, 'Exclusion not found.');
  guardEntity(u, entityId);

  const affected = await tx(async c => {
    await c.query(`DELETE FROM compliance_exclusions WHERE compliance_id = $1 AND entity_id = $2`,
      [complianceId, entityId]);
    const upd = await c.query<{ id: string }>(
      `UPDATE obligations SET status = 'Not Started', workflow_stage = 'preparer'
        WHERE compliance_id = $1 AND entity_id = $2 AND deleted_at IS NULL AND status = 'Not Applicable'
        RETURNING id`,
      [complianceId, entityId]);
    return upd.rowCount;
  });

  await writeAudit({
    actor: u, action: 'compliance.include', objectType: 'compliance', objectId: complianceId,
    detail: `${row.title} marked applicable again for ${row.short_name} (${affected} obligation${affected === 1 ? '' : 's'} reopened)`,
  });
  return ok({ ok: true, affected });
});
