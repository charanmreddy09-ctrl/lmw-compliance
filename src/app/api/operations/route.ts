/* ===========================================================================
   OPERATIONS — continuous audit and platform health  (C19 / C20)
   ---------------------------------------------------------------------------
   Everything an administrator needs to answer "is the platform actually
   working", on one request.

   Two halves:

     AUTOMATION   Did the scheduled jobs run? The due-date sync and the
                  escalation matrix are the only two things that happen
                  without a person, and both are signed with CRON_SECRET.
                  When that variable is missing Vercel's cron gets a 401 on
                  every run, forever, and nothing anywhere says so — the
                  platform simply stops escalating and nobody finds out. Both
                  jobs write an audit_log row on every run, so their silence
                  is measurable, and this reports it.

     ANOMALIES    Conditions that are individually legal but operationally
                  wrong: work sitting with nobody, approvals that beat their
                  own evidence, obligations nobody owns. Each check returns a
                  count and a handful of examples rather than the full set —
                  this is a health screen, not a work queue, and the register
                  is where the actual work gets done.

   Read-only. Nothing here writes, and nothing here is scoped away from an
   administrator: a health screen that hides half the estate is not one.
   =========================================================================== */
import { handler, ok, authWith } from '@/lib/api';
import { q } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** A scheduled job is considered silent if it has not run in this long.
    Both crons are daily, so a day and a half allows one missed run before
    raising it — long enough not to cry wolf over a slow night, short enough
    to notice before a filing deadline passes unescalated. */
const JOB_SILENT_AFTER_HOURS = 36;

/** Matches the review turnaround target reported on the reviewer workbench. */
const REVIEW_SLA_HOURS = 48;

type JobRow = { action: string; last_run: string | null; runs_7d: string; last_detail: string | null };

export const GET = handler(async () => {
  await authWith('audit.view');

  const [jobs, notif, anomalies] = await Promise.all([
    /* Cron health, from the audit rows the jobs themselves write. */
    q<JobRow>(`
      SELECT a.action,
             max(a.created_at)                                            AS last_run,
             count(*) FILTER (WHERE a.created_at > now() - INTERVAL '7 days') AS runs_7d,
             (SELECT detail FROM audit_log d
               WHERE d.action = a.action ORDER BY d.created_at DESC LIMIT 1) AS last_detail
        FROM audit_log a
       WHERE a.action IN ('duedate.sync','escalation.run')
       GROUP BY a.action`),

    q<{ sent_7d: string; unread: string; popups_open: string }>(`
      SELECT count(*) FILTER (WHERE created_at > now() - INTERVAL '7 days') AS sent_7d,
             count(*) FILTER (WHERE read_at IS NULL)                        AS unread,
             count(*) FILTER (WHERE is_popup AND read_at IS NULL)           AS popups_open
        FROM notifications`),

    /* One pass, one row per check. Written as a UNION so a new check is a
       new SELECT rather than another round trip. `sample` carries a few
       human-readable references so the count is actionable instead of just
       alarming. */
    q<{ key: string; n: string; sample: string[] | null }>(`
      -- Submitted work with nobody named to review it. The queue shows these
      -- to anyone holding rights on the entity, so they are not lost, but no
      -- individual owns them and no reminder can name a person.
      SELECT 'unassigned_review' AS key, count(*) AS n,
             (array_agg(reference ORDER BY due_date))[1:5] AS sample
        FROM obligations
       WHERE deleted_at IS NULL AND reviewer_id IS NULL
         AND status IN ('Submitted','Under Review')

      UNION ALL
      -- Sitting with a reviewer past the turnaround target.
      SELECT 'review_overdue', count(*),
             (array_agg(o.reference ORDER BY o.due_date))[1:5]
        FROM obligations o
       WHERE o.deleted_at IS NULL
         AND o.status IN ('Submitted','Under Review')
         AND EXISTS (
           SELECT 1 FROM evidence e
            WHERE e.obligation_id = o.id AND e.deleted_at IS NULL
              AND e.uploaded_at < now() - INTERVAL '${REVIEW_SLA_HOURS} hours')

      UNION ALL
      -- Approved with no document behind it. The score treats an approval as
      -- proof, so an approval with nothing attached is the one anomaly here
      -- that actually inflates the headline number.
      SELECT 'approved_no_evidence', count(*),
             (array_agg(o.reference ORDER BY o.due_date DESC))[1:5]
        FROM obligations o
       WHERE o.deleted_at IS NULL AND o.status = 'Approved'
         AND NOT EXISTS (
           SELECT 1 FROM evidence e WHERE e.obligation_id = o.id AND e.deleted_at IS NULL)

      UNION ALL
      -- Due, unfiled and unowned: no preparer to remind.
      SELECT 'unassigned_preparer', count(*),
             (array_agg(reference ORDER BY due_date))[1:5]
        FROM obligations
       WHERE deleted_at IS NULL AND assigned_to IS NULL
         AND status NOT IN ('Approved','Not Applicable')
         AND due_date <= CURRENT_DATE

      UNION ALL
      -- Assigned to an account that can no longer sign in, so the work is
      -- addressed to nobody while looking assigned.
      SELECT 'assignee_inactive', count(*),
             (array_agg(o.reference ORDER BY o.due_date))[1:5]
        FROM obligations o
        JOIN users u ON u.id = o.assigned_to
       WHERE o.deleted_at IS NULL
         AND o.status NOT IN ('Approved','Not Applicable')
         AND (u.status <> 'active' OR u.deleted_at IS NOT NULL)

      UNION ALL
      -- Live library records with no structured due rule. These cannot
      -- generate a due date, so obligations for them are guesswork.
      SELECT 'compliance_no_due_rule', count(*),
             (array_agg(code ORDER BY code))[1:5]
        FROM compliances
       WHERE deleted_at IS NULL AND NOT is_archived
         AND (due_day IS NULL OR due_month IS NULL)

      UNION ALL
      -- Unverified library records. Every compliance carries a verified flag,
      -- false until an adviser confirms it; the score counts them regardless.
      SELECT 'compliance_unverified', count(*),
             (array_agg(code ORDER BY code))[1:5]
        FROM compliances
       WHERE deleted_at IS NULL AND NOT is_archived AND NOT verified

      UNION ALL
      -- Accounts left pending approval. Somebody asked for access and nobody
      -- answered.
      SELECT 'users_pending', count(*),
             (array_agg(email ORDER BY created_at))[1:5]
        FROM users
       WHERE deleted_at IS NULL AND status = 'pending'
    `),
  ]);

  const jobByName = Object.fromEntries(jobs.map(j => [j.action, j]));
  const automation = (['duedate.sync', 'escalation.run'] as const).map(name => {
    const row = jobByName[name];
    const last = row?.last_run ? new Date(row.last_run) : null;
    const hoursSince = last ? (Date.now() - last.getTime()) / 3_600_000 : null;
    return {
      job: name,
      label: name === 'duedate.sync' ? 'Due-date sync' : 'Escalation matrix',
      lastRun: row?.last_run ?? null,
      runs7d: Number(row?.runs_7d ?? 0),
      lastDetail: row?.last_detail ?? null,
      /* never = has genuinely never run, which on a fresh deployment most
         likely means CRON_SECRET was never set */
      state: last == null ? 'never'
        : (hoursSince as number) > JOB_SILENT_AFTER_HOURS ? 'silent'
        : 'healthy',
      hoursSince: hoursSince == null ? null : Math.round(hoursSince),
    };
  });

  const found = Object.fromEntries(anomalies.map(a => [a.key, a]));
  const check = (key: string) => ({
    key,
    count: Number(found[key]?.n ?? 0),
    sample: found[key]?.sample ?? [],
  });

  return ok({
    automation,
    slaHours: REVIEW_SLA_HOURS,
    silentAfterHours: JOB_SILENT_AFTER_HOURS,
    notifications: {
      sent7d: Number(notif[0]?.sent_7d ?? 0),
      unread: Number(notif[0]?.unread ?? 0),
      popupsOpen: Number(notif[0]?.popups_open ?? 0),
    },
    anomalies: [
      'approved_no_evidence', 'unassigned_review', 'review_overdue',
      'unassigned_preparer', 'assignee_inactive',
      'compliance_no_due_rule', 'compliance_unverified', 'users_pending',
    ].map(check),
    checkedAt: new Date().toISOString(),
  });
});
