/* Compliance calendar for a month, scoped to the user's entities. */
import { handler, ok, auth, entityFilter } from '@/lib/api';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request) => {
  const u = await auth();
  const scope = entityFilter(u);
  const p = new URL(req.url).searchParams;
  const year = parseInt(p.get('year') ?? '', 10) || new Date().getUTCFullYear();
  const month = parseInt(p.get('month') ?? '', 10) || (new Date().getUTCMonth() + 1);
  const entity = p.get('entity');
  const country = p.get('country');

  const vals: unknown[] = [year, month];
  let extra = '';
  if (scope) { vals.push(scope); extra += ` AND o.entity_id = ANY($${vals.length})`; }
  if (entity) { vals.push(entity); extra += ` AND o.entity_id = $${vals.length}`; }
  if (country) { vals.push(country); extra += ` AND e.country_code = $${vals.length}`; }

  const rows = await q(`
    SELECT o.id, o.due_date, o.status, o.period_label, o.delay_days,
           c.title, c.code, c.risk_level, c.frequency, c.form_reference,
           cat.name AS category, e.short_name AS entity, e.id AS entity_id, e.country_code,
           j.name AS jurisdiction
      FROM obligations o
      JOIN compliances c ON c.id = o.compliance_id
      JOIN categories cat ON cat.id = c.category_id
      LEFT JOIN jurisdictions j ON j.id = c.jurisdiction_id
      JOIN entities e ON e.id = o.entity_id
     WHERE o.deleted_at IS NULL
       AND EXTRACT(YEAR FROM o.due_date) = $1
       AND EXTRACT(MONTH FROM o.due_date) = $2
       ${extra}
     ORDER BY o.due_date, c.title`, vals);

  const changes = await q(`
    SELECT ddc.obligation_id, ddc.old_due_date, ddc.new_due_date, ddc.reason, ddc.changed_at
      FROM due_date_changes ddc
     WHERE EXTRACT(YEAR FROM ddc.new_due_date) = $1
       AND EXTRACT(MONTH FROM ddc.new_due_date) = $2
     ORDER BY ddc.changed_at DESC`, [year, month]);

  const entities = await q(`
    SELECT id, short_name, country_code FROM entities
     WHERE deleted_at IS NULL ${scope ? 'AND id = ANY($1)' : ''} ORDER BY short_name`,
    scope ? [scope] : []);

  return ok({ year, month, events: rows, changes, entities });
});
