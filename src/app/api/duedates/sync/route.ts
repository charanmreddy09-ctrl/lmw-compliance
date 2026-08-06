/* ===========================================================================
   DUE-DATE SYNC — run the check
   Triggered manually (Compliance Library -> "Check for updates now", POST,
   requires duedate.manage) or by the daily Vercel Cron (vercel.json, GET).
   Vercel signs cron requests with `Authorization: Bearer $CRON_SECRET`
   automatically once a CRON_SECRET env var is set — that's checked below
   instead of a session. Either way this only ever proposes a change; see
   src/lib/duedate-sync.ts and /api/duedates/pending for the approval step.
   =========================================================================== */
import { handler, ok, fail, authWith, writeAudit } from '@/lib/api';
import { q } from '@/lib/db';
import { checkComplianceSource } from '@/lib/duedate-sync';
import type { SessionUser } from '@/lib/rbac';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Row = {
  id: string; code: string; title: string; form_reference: string | null;
  due_source_url: string | null; government_site: string | null;
  due_day: number | null; due_month: number | null; country_code: string;
};

function representativeDate(day: number, month: number): string {
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const candidate = new Date(Date.UTC(thisYear, month - 1, day));
  const year = candidate.getTime() < Date.now() ? thisYear + 1 : thisYear;
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

async function runSync(actor: SessionUser | null) {
  const rows = await q<Row>(`
    SELECT id, code, title, form_reference, due_source_url, government_site, due_day, due_month, country_code
      FROM compliances
     WHERE deleted_at IS NULL AND NOT is_archived
       AND (due_source_url IS NOT NULL OR government_site IS NOT NULL)`);

  let checked = 0, proposed = 0;
  for (const r of rows) {
    checked++;
    const result = await checkComplianceSource({
      id: r.id, title: r.title, formReference: r.form_reference,
      dueSourceUrl: r.due_source_url, governmentSite: r.government_site,
      dueDay: r.due_day, dueMonth: r.due_month,
    });

    await q(`UPDATE compliances SET due_last_checked_at = now(), due_last_check_note = $2 WHERE id = $1`,
      [r.id, result.note]);

    if (!result.found) continue;
    proposed++;

    const newDue = representativeDate(result.candidateDay, result.candidateMonth);
    const oldDue = r.due_day && r.due_month ? representativeDate(r.due_day, r.due_month) : null;

    await q(`
      INSERT INTO due_date_changes (compliance_id, country_code, old_due_date, new_due_date, reason, source, status)
      VALUES ($1,$2,$3,$4,$5,'auto-check','pending')`,
      [r.id, r.country_code, oldDue, newDue, result.note]);

    const recipients = await q<{ id: string }>(
      `SELECT u.id FROM users u JOIN roles ro ON ro.id = u.role_id
        WHERE ro.permissions @> '["duedate.manage"]'::jsonb AND u.status = 'active'`);
    for (const rec of recipients) {
      await q(`
        INSERT INTO notifications (user_id, country_code, kind, title, body, link, severity, is_popup)
        VALUES ($1,$2,'due_date_proposal',$3,$4,'/compliance','warning',FALSE)`,
        [rec.id, r.country_code, `Possible due-date change — ${r.code}`,
         `${r.title}: the source page suggests ${result.candidateDay} ${['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][result.candidateMonth]} instead of the date on file. Review in Compliance Library.`]);
    }
  }

  if (actor) {
    await writeAudit({ actor, action: 'duedate.sync', objectType: 'compliance', detail: `Checked ${checked}, proposed ${proposed} change(s).` });
  }
  return { checked, proposed };
}

/** Manual trigger from the Compliance Library UI. */
export const POST = handler(async () => {
  const u = await authWith('duedate.manage');
  return ok(await runSync(u));
});

/** Daily Vercel Cron trigger (see vercel.json). Requires CRON_SECRET to be
    set as an env var — without it this route refuses cron-style requests
    entirely rather than running unauthenticated. */
export const GET = handler(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) return fail(401, 'Not authorized.');
  return ok(await runSync(null));
});
