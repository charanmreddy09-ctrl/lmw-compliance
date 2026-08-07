import { handler, ok, fail, auth, body, writeAudit } from '@/lib/api';
import { q, one } from '@/lib/db';
import { canSeeEntity, canSeeCategory } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export const GET = handler(async (_req: Request, ctx: { params: { id: string } }) => {
  const u = await auth();
  const row = await one<Record<string, unknown>>(`
    SELECT o.*, c.code, c.title, c.applicable_law, c.form_reference, c.authority,
           c.frequency, c.due_rule, c.risk_level, c.evidence_required, c.penalty,
           c.government_site, cat.id AS category_id, cat.name AS category,
           j.name AS jurisdiction, e.short_name AS entity, e.name AS entity_name,
           e.country_code, co.name AS country_name,
           au.full_name AS assigned_to_name, rv.full_name AS reviewer_name
      FROM obligations o
      JOIN compliances c ON c.id = o.compliance_id
      JOIN categories cat ON cat.id = c.category_id
      LEFT JOIN jurisdictions j ON j.id = c.jurisdiction_id
      JOIN entities e ON e.id = o.entity_id
      JOIN countries co ON co.code = e.country_code
      LEFT JOIN users au ON au.id = o.assigned_to
      LEFT JOIN users rv ON rv.id = o.reviewer_id
     WHERE o.id = $1 AND o.deleted_at IS NULL`, [ctx.params.id]);

  if (!row) return fail(404, 'Obligation not found.');
  if (!canSeeEntity(u, String(row.entity_id))) return fail(403, 'You are not assigned to this entity.');
  if (!canSeeCategory(u, String(row.category_id)))
    return fail(403, 'Your role is not assigned this compliance category.');

  const [files, trail, changes] = await Promise.all([
    q(`SELECT id, file_name, mime_type, size_bytes, version, doc_type, period_label,
              filed_date, status, validation, is_nil, uploaded_at, reviewed_at,
              (SELECT full_name FROM users WHERE id = uploaded_by) AS uploaded_by_name,
              (SELECT full_name FROM users WHERE id = reviewed_by) AS reviewed_by_name
         FROM evidence WHERE obligation_id = $1 AND deleted_at IS NULL
        ORDER BY version DESC, uploaded_at DESC`, [ctx.params.id]),
    q(`SELECT ra.id, ra.action, ra.comment, ra.from_status, ra.to_status, ra.created_at,
              u.full_name AS actor, ra.actor_role,
              tu.full_name AS target_user
         FROM review_actions ra
         LEFT JOIN users u ON u.id = ra.actor_id
         LEFT JOIN users tu ON tu.id = ra.target_user_id
        WHERE ra.obligation_id = $1 ORDER BY ra.created_at ASC`, [ctx.params.id]),
    q(`SELECT old_due_date, new_due_date, reason, changed_at, source
         FROM due_date_changes WHERE obligation_id = $1 ORDER BY changed_at DESC`, [ctx.params.id]),
  ]);

  return ok({ obligation: row, files, trail, changes });
});

/* Assign or reassign the preparer / reviewer, or edit notes. */
export const PATCH = handler(async (req: Request, ctx: { params: { id: string } }) => {
  const u = await auth();
  const b = await body<{ assigned_to?: string | null; reviewer_id?: string | null; notes?: string }>(req);

  const cur = await one<{ entity_id: string; status: string }>(
    `SELECT entity_id, status FROM obligations WHERE id = $1 AND deleted_at IS NULL`, [ctx.params.id]);
  if (!cur) return fail(404, 'Obligation not found.');
  if (!canSeeEntity(u, cur.entity_id)) return fail(403, 'You are not assigned to this entity.');

  const mayAssign = u.permissions.includes('compliance.review') ||
                    u.permissions.includes('delegation.manage') ||
                    u.permissions.includes('users.manage');
  if ((b.assigned_to !== undefined || b.reviewer_id !== undefined) && !mayAssign)
    return fail(403, 'Your role does not permit reassignment.');

  const row = await one(`
    UPDATE obligations
       SET assigned_to = COALESCE($2, assigned_to),
           reviewer_id = COALESCE($3, reviewer_id),
           notes = COALESCE($4, notes)
     WHERE id = $1 RETURNING id, assigned_to, reviewer_id, notes`,
    [ctx.params.id, b.assigned_to ?? null, b.reviewer_id ?? null, b.notes ?? null]);

  if (b.assigned_to || b.reviewer_id) {
    await q(`INSERT INTO review_actions (obligation_id, action, actor_id, actor_role, comment, target_user_id)
             VALUES ($1,'reassign',$2,$3,$4,$5)`,
      [ctx.params.id, u.id, u.role,
       b.assigned_to ? 'Preparer reassigned' : 'Reviewer reassigned',
       b.assigned_to ?? b.reviewer_id ?? null]);
  }
  await writeAudit({ actor: u, action: 'obligation.update', objectType: 'obligation', objectId: ctx.params.id,
    detail: JSON.stringify(b) });
  return ok({ obligation: row });
});
