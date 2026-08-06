/* Pre-filled with the current due dates for the chosen country so the user
   edits reality rather than typing from scratch. */
import { handler, auth, fail } from '@/lib/api';
import { q } from '@/lib/db';
import { dueDateTemplate } from '@/lib/excel';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request) => {
  await auth();
  const country = new URL(req.url).searchParams.get('country');
  if (!country) return fail(400, 'Choose a country before downloading the due-date template.');

  const [cRow] = await q<{ name: string }>(`SELECT name FROM countries WHERE code = $1`, [country]);
  if (!cRow) return fail(404, 'Unknown country code.');

  const rows = await q<{ code: string; entity_id: string; period_label: string; due_date: string }>(`
    SELECT c.code, o.entity_id, o.period_label, to_char(o.due_date,'DD/MM/YYYY') AS due_date
      FROM obligations o
      JOIN compliances c ON c.id = o.compliance_id
      JOIN entities e ON e.id = o.entity_id
     WHERE e.country_code = $1 AND o.deleted_at IS NULL
       AND o.status NOT IN ('Approved','Not Applicable')
     ORDER BY o.due_date, c.code LIMIT 4000`, [country]);

  const entities = await q<{ id: string; name: string }>(
    `SELECT id, name FROM entities WHERE country_code = $1 AND deleted_at IS NULL ORDER BY name`, [country]);

  const buf = dueDateTemplate({
    countryCode: country, countryName: cRow.name,
    entities,
    obligations: rows.map(r => ({ code: r.code, entityId: r.entity_id, period: r.period_label, due: r.due_date })),
  });

  return new Response(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="SGCMP_DueDates_${country}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
});
