import { handler, ok, auth, fail } from '@/lib/api';
import { q, one } from '@/lib/db';
import { entityScores } from '@/lib/score';
import { canSeeEntity } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

export const GET = handler(async (_req: Request, ctx: { params: { id: string } }) => {
  const u = await auth();
  const id = ctx.params.id;
  if (!canSeeEntity(u, id)) return fail(403, 'You are not assigned to this entity.');

  const entity = await one(`
    SELECT e.*, c.name AS country_name, c.currency AS country_currency,
           d.name AS division_name, j.name AS jurisdiction_name
      FROM entities e
      JOIN countries c ON c.code = e.country_code
      LEFT JOIN divisions d ON d.id = e.division_id
      LEFT JOIN jurisdictions j ON j.id = e.jurisdiction_id
     WHERE e.id = $1 AND e.deleted_at IS NULL`, [id]);
  if (!entity) return fail(404, 'Entity not found.');

  const [scores, states, byCategory, byStatus, obligations, recent, changes] = await Promise.all([
    entityScores([id]),
    q(`SELECT j.id, j.name, j.level, j.code FROM entity_jurisdictions ej
         JOIN jurisdictions j ON j.id = ej.jurisdiction_id
        WHERE ej.entity_id = $1 ORDER BY j.level, j.name`, [id]),
    q(`SELECT cat.name AS category, count(*) AS total,
              count(*) FILTER (WHERE o.status = 'Approved') AS approved,
              count(*) FILTER (WHERE o.status <> 'Approved' AND o.filed_date IS NULL
                                 AND o.due_date < CURRENT_DATE) AS overdue
         FROM obligations o
         JOIN compliances c ON c.id = o.compliance_id
         JOIN categories cat ON cat.id = c.category_id
        WHERE o.entity_id = $1 AND o.deleted_at IS NULL AND o.status <> 'Not Applicable'
        GROUP BY cat.name ORDER BY cat.name`, [id]),
    q(`SELECT status, count(*) AS n FROM obligations
        WHERE entity_id = $1 AND deleted_at IS NULL GROUP BY status`, [id]),
    q(`SELECT o.id, o.reference, o.period_label, o.due_date, o.filed_date, o.status,
              o.delay_days, c.title, c.code, c.risk_level, c.frequency, c.form_reference,
              cat.name AS category, j.name AS jurisdiction,
              (SELECT count(*) FROM evidence ev WHERE ev.obligation_id = o.id AND ev.deleted_at IS NULL) AS files
         FROM obligations o
         JOIN compliances c ON c.id = o.compliance_id
         JOIN categories cat ON cat.id = c.category_id
         LEFT JOIN jurisdictions j ON j.id = c.jurisdiction_id
        WHERE o.entity_id = $1 AND o.deleted_at IS NULL
        ORDER BY o.due_date DESC`, [id]),
    q(`SELECT ra.action, ra.comment, ra.created_at, ra.to_status,
              u.full_name AS actor, c.title
         FROM review_actions ra
         JOIN obligations o ON o.id = ra.obligation_id
         JOIN compliances c ON c.id = o.compliance_id
         LEFT JOIN users u ON u.id = ra.actor_id
        WHERE o.entity_id = $1 ORDER BY ra.created_at DESC LIMIT 20`, [id]),
    q(`SELECT ddc.old_due_date, ddc.new_due_date, ddc.reason, ddc.changed_at, c.title
         FROM due_date_changes ddc
         LEFT JOIN obligations o ON o.id = ddc.obligation_id
         LEFT JOIN compliances c ON c.id = o.compliance_id
        WHERE ddc.entity_id = $1 ORDER BY ddc.changed_at DESC LIMIT 10`, [id]),
  ]);

  return ok({ entity, score: scores[id] ?? null, states, byCategory, byStatus, obligations, recent, changes });
});
