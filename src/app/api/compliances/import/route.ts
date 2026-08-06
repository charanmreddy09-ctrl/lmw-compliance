/* Excel import. Creates or updates library records; they become active at once. */
import { handler, ok, fail, authWith, writeAudit } from '@/lib/api';
import { q, one, tx } from '@/lib/db';
import { parseComplianceWorkbook } from '@/lib/excel';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = handler(async (req: Request) => {
  const u = await authWith('compliance.library');
  const form = await req.formData();
  const file = form.get('file');
  /* Accept the flag from either the form body or the query string so the
     endpoint behaves the same however the caller drives it. */
  const dryRun = form.get('dryRun') === 'true' ||
    new URL(req.url).searchParams.get('dryRun') === 'true';
  if (!(file instanceof File)) return fail(400, 'Attach the completed Excel template.');
  if (file.size > 6 * 1024 * 1024) return fail(400, 'File is larger than 6 MB. Split the import into smaller files.');

  const { rows, errors } = parseComplianceWorkbook(await file.arrayBuffer());
  if (!rows.length && errors.length) return fail(400, `No valid rows found. ${errors[0]}`);
  if (!rows.length) return fail(400, 'The sheet contains no data rows.');

  /* validate references before touching anything */
  const [countries, categories, jurisdictions] = await Promise.all([
    q<{ code: string }>(`SELECT code FROM countries`),
    q<{ id: string }>(`SELECT id FROM categories`),
    q<{ id: string }>(`SELECT id FROM jurisdictions`),
  ]);
  const cSet = new Set(countries.map(r => r.code));
  const catSet = new Set(categories.map(r => r.id));
  const jSet = new Set(jurisdictions.map(r => r.id));

  const refErrors: string[] = [...errors];
  const valid = rows.filter(r => {
    if (!cSet.has(r.country)) { refErrors.push(`Row ${r._row}: country "${r.country}" is not set up. Add it in Administration first.`); return false; }
    if (!catSet.has(r.category)) { refErrors.push(`Row ${r._row}: category "${r.category}" is not valid. See the Reference sheet.`); return false; }
    if (!jSet.has(r.jurisdiction)) { refErrors.push(`Row ${r._row}: jurisdiction "${r.jurisdiction}" does not exist. Create it in Administration first.`); return false; }
    return true;
  });

  if (dryRun) {
    const existing = await q<{ code: string }>(
      `SELECT code FROM compliances WHERE code = ANY($1)`, [valid.map(v => v.code)]);
    const ex = new Set(existing.map(e => e.code));
    return ok({
      preview: true,
      total: rows.length,
      willCreate: valid.filter(v => !ex.has(v.code)).length,
      willUpdate: valid.filter(v => ex.has(v.code)).length,
      rejected: refErrors.length,
      errors: refErrors.slice(0, 40),
      sample: valid.slice(0, 8),
    });
  }

  let created = 0, updated = 0;
  await tx(async c => {
    for (const r of valid) {
      const prev = await c.query<{ id: string }>(`SELECT id FROM compliances WHERE code = $1`, [r.code]);
      const res = await c.query<{ id: string }>(`
        INSERT INTO compliances (code, country_code, jurisdiction_id, category_id, title,
          applicable_law, form_reference, authority, government_site, frequency, due_rule,
          due_day, due_month, evidence_required, penalty, risk_level,
          applies_if_listed, applies_if_factory, applies_if_importer, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20)
        ON CONFLICT (code) DO UPDATE SET
          country_code=EXCLUDED.country_code, jurisdiction_id=EXCLUDED.jurisdiction_id,
          category_id=EXCLUDED.category_id, title=EXCLUDED.title,
          applicable_law=EXCLUDED.applicable_law, form_reference=EXCLUDED.form_reference,
          authority=EXCLUDED.authority, government_site=EXCLUDED.government_site,
          frequency=EXCLUDED.frequency, due_rule=EXCLUDED.due_rule,
          due_day=EXCLUDED.due_day, due_month=EXCLUDED.due_month,
          evidence_required=EXCLUDED.evidence_required, penalty=EXCLUDED.penalty,
          risk_level=EXCLUDED.risk_level, applies_if_listed=EXCLUDED.applies_if_listed,
          applies_if_factory=EXCLUDED.applies_if_factory, applies_if_importer=EXCLUDED.applies_if_importer,
          is_archived=FALSE, deleted_at=NULL
        RETURNING id`,
        [r.code, r.country, r.jurisdiction, r.category, r.title, r.law, r.form, r.authority,
         r.site, r.frequency, r.dueRule, r.dueDay, r.dueMonth, JSON.stringify(r.evidence),
         r.penalty, r.risk, r.listed, r.factory, r.importer, u.id]);
      if (prev.rows.length) updated++; else created++;
      await c.query(`INSERT INTO compliance_history (compliance_id, changed_by, change_type, after_data, note)
                     VALUES ($1,$2,$3,$4::jsonb,$5)`,
        [res.rows[0].id, u.id, prev.rows.length ? 'import-update' : 'import-create',
         JSON.stringify(r), `Imported from ${file.name}`]);
    }
  });

  await writeAudit({ actor: u, action: 'compliance.import', objectType: 'compliance',
    detail: `${created} created, ${updated} updated from ${file.name}`,
    meta: { created, updated, rejected: refErrors.length } });

  return ok({ created, updated, rejected: refErrors.length, errors: refErrors.slice(0, 40) });
});
