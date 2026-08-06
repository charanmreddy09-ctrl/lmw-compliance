import { handler, ok, auth, entityFilter } from '@/lib/api';
import { q } from '@/lib/db';
import { entityScores } from '@/lib/score';

export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const u = await auth();
  const scope = entityFilter(u);

  const rows = await q(`
    SELECT e.id, e.name, e.short_name, e.country_code, c.name AS country_name,
           e.entity_type, e.city, e.currency, e.fy_end, e.employees,
           e.is_listed, e.has_factory, e.is_importer,
           e.statutory_auditor, e.local_advisor,
           d.name AS division_name, j.name AS jurisdiction_name,
           (SELECT count(*) FROM obligations o
             WHERE o.entity_id = e.id AND o.deleted_at IS NULL
               AND o.status <> 'Not Applicable') AS obligations,
           (SELECT string_agg(j2.name, ', ' ORDER BY j2.name)
              FROM entity_jurisdictions ej JOIN jurisdictions j2 ON j2.id = ej.jurisdiction_id
             WHERE ej.entity_id = e.id AND j2.level <> 'federal') AS states
      FROM entities e
      JOIN countries c ON c.code = e.country_code
      LEFT JOIN divisions d ON d.id = e.division_id
      LEFT JOIN jurisdictions j ON j.id = e.jurisdiction_id
     WHERE e.deleted_at IS NULL ${scope ? 'AND e.id = ANY($1)' : ''}
     ORDER BY c.name, e.name`, scope ? [scope] : []);

  const scores = await entityScores(scope ?? undefined);
  return ok({ entities: rows, scores });
});
