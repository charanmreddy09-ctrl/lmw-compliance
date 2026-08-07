/* ===========================================================================
   ESCALATION MATRIX — run the daily check
   Triggered by the Vercel Cron (vercel.json, GET, signed with CRON_SECRET)
   or manually from the Reviews page (POST, requires compliance.review).
   =========================================================================== */
import { handler, ok, fail, authWith, writeAudit } from '@/lib/api';
import { runEscalations } from '@/lib/escalation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = handler(async () => {
  const u = await authWith('compliance.review');
  const summary = await runEscalations();
  await writeAudit({
    actor: u, action: 'escalation.run', objectType: 'obligation',
    detail: `Reminders ${summary.reminders}, department head ${summary.deptHead}, CFO ${summary.cfo}, audit committee ${summary.auditCommittee}`,
  });
  return ok(summary);
});

/** Daily Vercel Cron trigger (see vercel.json). Requires CRON_SECRET to be
    set as an env var, matching the due-date sync cron's own guard. */
export const GET = handler(async (req: Request) => {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) return fail(401, 'Not authorized.');
  return ok(await runEscalations());
});
