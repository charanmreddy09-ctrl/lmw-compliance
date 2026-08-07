/* Fully dynamic compliance library: list, create, update, archive, delete. */
import { handler, ok, fail, auth, authWith, body, writeAudit } from '@/lib/api';
import { q, one, tx } from '@/lib/db';
import { can } from '@/lib/rbac';
import { fyLabel } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export const GET = handler(async (req: Request) => {
  await auth();
  const p = new URL(req.url).searchParams;
  const where: string[] = ['c.deleted_at IS NULL'];
  const vals: unknown[] = [];
  const add = (sql: string, v: unknown) => { vals.push(v); where.push(sql.replace('?', `$${vals.length}`)); };

  if (p.get('country')) add('c.country_code = ?', p.get('country'));
  if (p.get('jurisdiction')) add('c.jurisdiction_id = ?', p.get('jurisdiction'));
  if (p.get('category')) add('c.category_id = ?', p.get('category'));
  if (p.get('frequency')) add('c.frequency = ?', p.get('frequency'));
  if (p.get('risk')) add('c.risk_level = ?', p.get('risk'));
  if (p.get('verified') === 'yes') where.push('c.verified');
  if (p.get('verified') === 'no') where.push('NOT c.verified');
  if (p.get('archived') === 'yes') where.push('c.is_archived');
  else where.push('NOT c.is_archived');
  if (p.get('search')) {
    vals.push(`%${p.get('search')}%`);
    where.push(`(c.title ILIKE $${vals.length} OR c.applicable_law ILIKE $${vals.length}
                 OR c.form_reference ILIKE $${vals.length} OR c.authority ILIKE $${vals.length}
                 OR c.code ILIKE $${vals.length})`);
  }

  /* "In use" counts obligations for the selected financial year only, once
     one is chosen — otherwise a compliance running since before this FY
     shows every FY's instances added together, which reads as "the full
     history" rather than "how many times this applies this year". */
  let fyPlaceholder = '';
  const fyParam = p.get('fy') ? parseInt(p.get('fy')!, 10) : null;
  if (fyParam != null && !Number.isNaN(fyParam)) {
    vals.push(fyParam);
    fyPlaceholder = `AND o.fy_start_year = $${vals.length}`;
  }

  const rows = await q(`
    SELECT c.id, c.code, c.country_code, co.name AS country_name,
           c.jurisdiction_id, j.name AS jurisdiction_name, j.level AS jurisdiction_level,
           c.category_id, cat.name AS category_name, c.title, c.applicable_law,
           c.form_reference, c.authority, c.government_site, c.frequency, c.due_rule,
           c.due_day, c.due_month, c.evidence_required, c.penalty, c.risk_level,
           c.applies_if_listed, c.applies_if_factory, c.applies_if_importer,
           c.verified, c.verified_by, c.verified_on, c.is_archived, c.updated_at,
           (SELECT count(*) FROM obligations o
              WHERE o.compliance_id = c.id AND o.deleted_at IS NULL ${fyPlaceholder}) AS instances
      FROM compliances c
      JOIN countries co ON co.code = c.country_code
      JOIN categories cat ON cat.id = c.category_id
      LEFT JOIN jurisdictions j ON j.id = c.jurisdiction_id
     WHERE ${where.join(' AND ')}
     ORDER BY co.name, j.level NULLS FIRST, cat.name, c.title`, vals);

  const [countries, categories, jurisdictions, fyRows] = await Promise.all([
    q(`SELECT code, name FROM countries ORDER BY name`),
    q(`SELECT id, name FROM categories ORDER BY sort_order`),
    q(`SELECT id, country_code, name, level, code FROM jurisdictions WHERE is_active ORDER BY country_code, level, name`),
    q<{ fy_start_year: number }>(`SELECT DISTINCT fy_start_year FROM obligations WHERE deleted_at IS NULL ORDER BY fy_start_year DESC`),
  ]);
  const availableFys = fyRows.map(r => ({ startYear: r.fy_start_year, label: fyLabel(r.fy_start_year) }));
  return ok({ compliances: rows, countries, categories, jurisdictions, availableFys });
});

type Payload = {
  id?: string; ids?: string[]; code?: string; country_code: string; jurisdiction_id?: string | null;
  category_id: string; title: string; applicable_law?: string; form_reference?: string;
  authority?: string; government_site?: string; frequency: string; due_rule?: string;
  due_day?: number | null; due_month?: number | null; evidence_required?: string[];
  penalty?: string; risk_level?: string;
  applies_if_listed?: boolean; applies_if_factory?: boolean; applies_if_importer?: boolean;
  verified?: boolean;
};

export const POST = handler(async (req: Request) => {
  const u = await authWith('compliance.library');
  const b = await body<Payload>(req);
  if (!b.title?.trim()) return fail(400, 'Compliance name is required.');
  if (!b.country_code) return fail(400, 'Country is required.');
  if (!b.category_id) return fail(400, 'Category is required.');

  const code = (b.code?.trim() || `${b.country_code}-NEW-${Date.now().toString(36).toUpperCase()}`);
  const row = await one<{ id: string }>(`
    INSERT INTO compliances (code, country_code, jurisdiction_id, category_id, title,
      applicable_law, form_reference, authority, government_site, frequency, due_rule,
      due_day, due_month, evidence_required, penalty, risk_level,
      applies_if_listed, applies_if_factory, applies_if_importer, verified, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19,$20,$21)
    RETURNING id`,
    [code, b.country_code, b.jurisdiction_id || `${b.country_code}-FED`, b.category_id, b.title.trim(),
     b.applicable_law ?? null, b.form_reference ?? null, b.authority ?? null, b.government_site ?? null,
     b.frequency, b.due_rule ?? null, b.due_day ?? null, b.due_month ?? null,
     JSON.stringify(b.evidence_required ?? []), b.penalty ?? null, b.risk_level ?? 'Medium',
     !!b.applies_if_listed, !!b.applies_if_factory, !!b.applies_if_importer, !!b.verified, u.id]);

  await q(`INSERT INTO compliance_history (compliance_id, changed_by, change_type, after_data, note)
           VALUES ($1,$2,'create',$3::jsonb,'Created in the application')`,
          [row!.id, u.id, JSON.stringify(b)]);
  await writeAudit({ actor: u, action: 'compliance.create', objectType: 'compliance', objectId: row!.id, detail: `${code} — ${b.title}` });
  return ok({ id: row!.id, code });
});

export const PATCH = handler(async (req: Request) => {
  const u = await auth();
  const hasLibrary = can(u, 'compliance.library');
  const hasVerify = can(u, 'compliance.verify');
  if (!hasLibrary && !hasVerify) return fail(403, 'Your role does not permit this action.');

  const b = await body<Payload>(req);
  const ids = b.ids?.length ? b.ids : (b.id ? [b.id] : []);
  if (!ids.length) return fail(400, 'Compliance id is required.');

  /* Signing off (verified: true) is a distinct action from editing the
     library record, always routed through here regardless of whether the
     actor also holds compliance.library — a library administrator's edit
     request never implicitly re-verifies a record. Reviewers hold
     compliance.verify without compliance.library and can sign off one or
     many newly added (not yet verified) items in a single call; they cannot
     touch an already-verified item or any other field. */
  if (b.verified === true) {
    if (!hasVerify) return fail(403, 'Your role does not permit signing off compliances.');
    const rows = await q<{ id: string; verified: boolean; title: string }>(
      `SELECT id, verified, title FROM compliances WHERE id = ANY($1) AND deleted_at IS NULL`, [ids]);
    if (!rows.length) return fail(404, 'Compliance not found.');
    const toVerify = rows.filter(r => !r.verified);
    if (!toVerify.length) return fail(409, 'The selected item(s) are already signed off — only a library administrator can change them further.');

    const verifiedIds = toVerify.map(r => r.id);
    const after = await q<{ id: string; title: string }>(
      `UPDATE compliances SET verified = TRUE, verified_by = $2, verified_on = CURRENT_DATE
        WHERE id = ANY($1) RETURNING id, title`, [verifiedIds, u.name]);
    for (const row of after) {
      await q(`INSERT INTO compliance_history (compliance_id, changed_by, change_type, note)
               VALUES ($1,$2,'verify','Signed off by a reviewer (new addition)')`, [row.id, u.id]);
      await writeAudit({ actor: u, action: 'compliance.verify', objectType: 'compliance', objectId: row.id, detail: row.title });
    }
    return ok({ verified: after.map(r => r.id), skipped: rows.length - toVerify.length });
  }

  if (!hasLibrary) return fail(403, 'Your role can only sign off newly added compliance items.');
  if (ids.length > 1) return fail(400, 'Only sign-off supports multiple items at once.');
  const [id] = ids;

  const before = await one<{ verified: boolean; title: string }>(
    `SELECT * FROM compliances WHERE id = $1 AND deleted_at IS NULL`, [id]);
  if (!before) return fail(404, 'Compliance not found.');

  const after = await one(`
    UPDATE compliances SET
      country_code = COALESCE($2, country_code),
      jurisdiction_id = COALESCE($3, jurisdiction_id),
      category_id = COALESCE($4, category_id),
      title = COALESCE($5, title),
      applicable_law = $6, form_reference = $7, authority = $8, government_site = $9,
      frequency = COALESCE($10, frequency), due_rule = $11,
      due_day = $12, due_month = $13,
      evidence_required = COALESCE($14::jsonb, evidence_required),
      penalty = $15, risk_level = COALESCE($16, risk_level),
      applies_if_listed = COALESCE($17, applies_if_listed),
      applies_if_factory = COALESCE($18, applies_if_factory),
      applies_if_importer = COALESCE($19, applies_if_importer),
      verified = COALESCE($20, verified)
    WHERE id = $1 RETURNING *`,
    [id, b.country_code ?? null, b.jurisdiction_id ?? null, b.category_id ?? null, b.title ?? null,
     b.applicable_law ?? null, b.form_reference ?? null, b.authority ?? null, b.government_site ?? null,
     b.frequency ?? null, b.due_rule ?? null, b.due_day ?? null, b.due_month ?? null,
     b.evidence_required ? JSON.stringify(b.evidence_required) : null,
     b.penalty ?? null, b.risk_level ?? null,
     b.applies_if_listed ?? null, b.applies_if_factory ?? null, b.applies_if_importer ?? null,
     b.verified ?? null, u.name]);

  await q(`INSERT INTO compliance_history (compliance_id, changed_by, change_type, before_data, after_data, note)
           VALUES ($1,$2,'update',$3::jsonb,$4::jsonb,'Edited in the application')`,
          [id, u.id, JSON.stringify(before), JSON.stringify(after)]);
  await writeAudit({ actor: u, action: 'compliance.update', objectType: 'compliance', objectId: id, detail: String(after?.title ?? '') });
  return ok({ compliance: after });
});

export const DELETE = handler(async (req: Request) => {
  const u = await authWith('compliance.library');
  const p = new URL(req.url).searchParams;
  const id = p.get('id');
  const mode = p.get('mode') ?? 'archive';
  if (!id) return fail(400, 'Compliance id is required.');

  const row = await one<{ title: string; code: string }>(`SELECT title, code FROM compliances WHERE id = $1`, [id]);
  if (!row) return fail(404, 'Compliance not found.');

  await tx(async c => {
    if (mode === 'delete') {
      // soft delete keeps history and any obligations already raised
      await c.query(`UPDATE compliances SET deleted_at = now() WHERE id = $1`, [id]);
      await c.query(`UPDATE obligations SET deleted_at = now() WHERE compliance_id = $1`, [id]);
    } else if (mode === 'restore') {
      await c.query(`UPDATE compliances SET is_archived = FALSE, deleted_at = NULL WHERE id = $1`, [id]);
    } else {
      await c.query(`UPDATE compliances SET is_archived = TRUE WHERE id = $1`, [id]);
    }
    await c.query(`INSERT INTO compliance_history (compliance_id, changed_by, change_type, note)
                   VALUES ($1,$2,$3,$4)`, [id, u.id, mode, `${mode} via application`]);
  });

  await writeAudit({ actor: u, action: `compliance.${mode}`, objectType: 'compliance', objectId: id, detail: `${row.code} — ${row.title}` });
  return ok({ ok: true, mode });
});
