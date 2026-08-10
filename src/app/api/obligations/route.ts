import { handler, ok, auth, entityFilter } from '@/lib/api';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request) => {
  const u = await auth();
  const scope = entityFilter(u);
  const p = new URL(req.url).searchParams;

  const where: string[] = ['o.deleted_at IS NULL'];
  const vals: unknown[] = [];
  const add = (sql: string, v: unknown) => { vals.push(v); where.push(sql.replace('?', `$${vals.length}`)); };

  if (scope) add('o.entity_id = ANY(?)', scope);
  if (p.get('entity')) add('o.entity_id = ?', p.get('entity'));
  if (p.get('country')) add('e.country_code = ?', p.get('country'));
  if (p.get('category')) add('cat.id = ?', p.get('category'));
  /* Enforced regardless of what the client asks for — a preparer restricted
     to specific laws never sees obligations outside them, even by request
     param or direct link. */
  if (u.allowedCategories) add('cat.id = ANY(?)', u.allowedCategories);
  if (p.get('status')) add('o.status = ?', p.get('status'));
  if (p.get('risk')) add('c.risk_level = ?', p.get('risk'));
  if (p.get('mine') === 'true') add('o.assigned_to = ?', u.id);
  if (p.get('review') === 'true') {
    where.push(`o.status IN ('Submitted','Under Review')`);
    if (!u.canReview.includes('*')) add('o.entity_id = ANY(?)', u.canReview);
  }
  if (p.get('overdue') === 'true')
    where.push(`o.status <> 'Approved' AND o.filed_date IS NULL AND o.due_date < CURRENT_DATE`);
  if (p.get('from')) add('o.due_date >= ?', p.get('from'));
  if (p.get('to')) add('o.due_date <= ?', p.get('to'));
  if (p.get('search')) {
    vals.push(`%${p.get('search')}%`);
    where.push(`(c.title ILIKE $${vals.length} OR c.code ILIKE $${vals.length}
                 OR o.reference ILIKE $${vals.length} OR c.form_reference ILIKE $${vals.length})`);
  }

  const rows = await q(`
    SELECT o.id, o.reference, o.period_label, o.due_date, o.original_due_date, o.filed_date,
           o.fy_start_year, o.status, o.workflow_stage, o.delay_days, o.penalty_exposure, o.notes,
           c.id AS compliance_id, c.code, c.title, c.applicable_law, c.form_reference,
           c.authority, c.frequency, c.risk_level, c.evidence_required, c.penalty,
           c.government_site,
           cat.id AS category_id, cat.name AS category,
           j.name AS jurisdiction, j.level AS jurisdiction_level,
           e.id AS entity_id, e.short_name AS entity, e.name AS entity_name, e.country_code,
           co.name AS country_name,
           au.full_name AS assigned_to_name, o.assigned_to,
           rv.full_name AS reviewer_name, o.reviewer_id,
           (SELECT count(*) FROM evidence ev WHERE ev.obligation_id = o.id AND ev.deleted_at IS NULL) AS files,
           (SELECT max(ev.uploaded_at) FROM evidence ev WHERE ev.obligation_id = o.id AND ev.deleted_at IS NULL) AS last_upload
      FROM obligations o
      JOIN compliances c ON c.id = o.compliance_id
      JOIN categories cat ON cat.id = c.category_id
      LEFT JOIN jurisdictions j ON j.id = c.jurisdiction_id
      JOIN entities e ON e.id = o.entity_id
      JOIN countries co ON co.code = e.country_code
      LEFT JOIN users au ON au.id = o.assigned_to
      LEFT JOIN users rv ON rv.id = o.reviewer_id
     WHERE ${where.join(' AND ')}
     ORDER BY o.due_date DESC
     LIMIT ${Math.min(3000, parseInt(p.get('limit') ?? '1500', 10) || 1500)}`, vals);

  return ok({ obligations: rows, count: rows.length });
});
