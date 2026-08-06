/* ===========================================================================
   DUE DATE ENGINE
   Detects a changed due date, updates the calendar, recalculates delay,
   records the change, and raises a country-specific popup notification for
   every affected user. All inside one transaction.
   =========================================================================== */
import { handler, ok, fail, authWith, writeAudit } from '@/lib/api';
import { q, tx } from '@/lib/db';
import { parseDueDateWorkbook } from '@/lib/excel';
import { parseDate, iso, toIsoDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = handler(async (req: Request) => {
  const u = await authWith('duedate.manage');
  const form = await req.formData();
  const file = form.get('file');
  /* Accept the flag from either the form body or the query string so the
     endpoint behaves the same however the caller drives it. */
  const dryRun = form.get('dryRun') === 'true' ||
    new URL(req.url).searchParams.get('dryRun') === 'true';
  if (!(file instanceof File)) return fail(400, 'Attach the completed due-date template.');

  const { rows, errors } = parseDueDateWorkbook(await file.arrayBuffer());
  if (!rows.length) return fail(400, errors[0] ?? 'The sheet contains no data rows.');

  type Target = {
    obligationId: string; entityId: string; countryCode: string; title: string;
    oldDue: string; newDue: string; reason: string; row: number;
  };
  const targets: Target[] = [];
  const problems: string[] = [...errors];

  for (const r of rows) {
    const nd = parseDate(r.newDue);
    if (!nd) { problems.push(`Row ${r._row}: "${r.newDue}" is not a valid date. Use DD/MM/YYYY.`); continue; }
    const newDue = iso(nd);

    const vals: unknown[] = [r.code];
    let sql = `
      SELECT o.id, o.entity_id, o.due_date, c.title, e.country_code
        FROM obligations o
        JOIN compliances c ON c.id = o.compliance_id
        JOIN entities e ON e.id = o.entity_id
       WHERE c.code = $1 AND o.deleted_at IS NULL AND o.status <> 'Not Applicable'`;
    if (r.entityId) { vals.push(r.entityId); sql += ` AND o.entity_id = $${vals.length}`; }
    if (r.period)   { vals.push(r.period);   sql += ` AND o.period_label = $${vals.length}`; }

    const found = await q<{ id: string; entity_id: string; due_date: string; title: string; country_code: string }>(sql, vals);
    if (!found.length) { problems.push(`Row ${r._row}: no open obligation found for compliance "${r.code}"${r.entityId ? ` and entity ${r.entityId}` : ''}.`); continue; }

    for (const f of found) {
      const oldDue = toIsoDate(f.due_date);
      if (!oldDue) continue;
      if (oldDue === newDue) continue;              // no change, skip silently
      targets.push({
        obligationId: f.id, entityId: f.entity_id, countryCode: f.country_code,
        title: f.title, oldDue, newDue, reason: r.reason || 'Due date revised', row: r._row,
      });
    }
  }

  if (dryRun) {
    return ok({
      preview: true, willChange: targets.length, rejected: problems.length,
      errors: problems.slice(0, 40),
      sample: targets.slice(0, 12).map(t => ({
        compliance: t.title, entity: t.entityId, from: t.oldDue, to: t.newDue, reason: t.reason,
      })),
    });
  }

  if (!targets.length) {
    return ok({ changed: 0, notified: 0, rejected: problems.length, errors: problems.slice(0, 40),
      message: 'No due dates differed from the values already on record.' });
  }

  let notified = 0;
  const byCountry = new Map<string, number>();

  await tx(async c => {
    for (const t of targets) {
      await c.query(
        `UPDATE obligations
            SET due_date = $2,
                delay_days = CASE WHEN filed_date IS NOT NULL AND filed_date > $2::date
                                  THEN (filed_date - $2::date) ELSE 0 END,
                status = CASE
                  WHEN status = 'Overdue' AND $2::date >= CURRENT_DATE THEN 'Evidence Pending'
                  WHEN status IN ('Not Started','Evidence Pending') AND $2::date < CURRENT_DATE THEN 'Overdue'
                  ELSE status END
          WHERE id = $1`, [t.obligationId, t.newDue]);

      await c.query(
        `INSERT INTO due_date_changes (obligation_id, country_code, entity_id,
            old_due_date, new_due_date, reason, source, changed_by)
         VALUES ($1,$2,$3,$4,$5,$6,'excel-import',$7)`,
        [t.obligationId, t.countryCode, t.entityId, t.oldDue, t.newDue, t.reason, u.id]);

      byCountry.set(t.countryCode, (byCountry.get(t.countryCode) ?? 0) + 1);

      /* notify everyone attached to that entity, plus group-wide users */
      const users = await c.query<{ user_id: string }>(
        `SELECT DISTINCT ue.user_id FROM user_entities ue
           JOIN users us ON us.id = ue.user_id
          WHERE (ue.entity_id = $1 OR ue.entity_id = '*')
            AND us.status = 'active' AND us.deleted_at IS NULL`, [t.entityId]);

      for (const row of users.rows) {
        await c.query(
          `INSERT INTO notifications (user_id, country_code, entity_id, kind, title, body, link, severity, is_popup)
           VALUES ($1,$2,$3,'due_date_change',$4,$5,$6,'warning',TRUE)`,
          [row.user_id, t.countryCode, t.entityId,
           `Due date changed — ${t.countryCode}`,
           `${t.title} (${t.entityId}): due date moved from ${t.oldDue} to ${t.newDue}. Reason: ${t.reason}`,
           `/register?obligation=${t.obligationId}`]);
        notified++;
      }
    }
  });

  await writeAudit({ actor: u, action: 'duedate.import', objectType: 'obligation',
    detail: `${targets.length} due dates changed from ${file.name}; ${notified} notifications raised`,
    meta: { byCountry: Object.fromEntries(byCountry), rejected: problems.length } });

  return ok({
    changed: targets.length, notified, rejected: problems.length,
    byCountry: Object.fromEntries(byCountry), errors: problems.slice(0, 40),
  });
});
