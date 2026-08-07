/* ===========================================================================
   ESCALATION MATRIX
   Day-based thresholds against each open obligation's due date:
     T-15 days   reminder            -> the preparer assigned to file it
     T-7 days    department head     -> the country head(s) for that entity
     overdue     CFO                 -> the CFO and CFO Office
     overdue,    Audit Committee     -> Auditors and the CFO, once an item is
     significant                        badly overdue (14+ days) or is
                                         Critical/High risk and any days overdue
   escalation_log deduplicates so the same obligation/level pair only ever
   fires once — re-running the check daily is always safe.
   =========================================================================== */
import { q, tx } from './db';

type Candidate = {
  id: string; due_date: string; risk_level: string; title: string;
  entity_id: string; country_code: string; period_label: string; assigned_to: string | null;
};

async function alreadyFired(obligationId: string, level: string): Promise<boolean> {
  const rows = await q<{ n: string }>(
    `SELECT count(*) AS n FROM escalation_log WHERE obligation_id = $1 AND level = $2`,
    [obligationId, level]);
  return Number(rows[0]?.n ?? 0) > 0;
}

async function fire(level: 'reminder' | 'dept_head' | 'cfo' | 'audit_committee',
  ob: Candidate, recipients: string[], title: string, bodyText: string) {
  if (await alreadyFired(ob.id, level)) return false;
  await tx(async c => {
    await c.query(`INSERT INTO escalation_log (obligation_id, level) VALUES ($1,$2)`, [ob.id, level]);
    for (const userId of recipients) {
      await c.query(
        `INSERT INTO notifications (user_id, country_code, entity_id, kind, title, body, link, severity, is_popup)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [userId, ob.country_code, ob.entity_id, `escalation_${level}`, title, bodyText,
         `/register?obligation=${ob.id}`,
         level === 'reminder' ? 'info' : level === 'dept_head' ? 'warning' : 'critical',
         level !== 'reminder']);
    }
    if (level !== 'reminder') {
      await c.query(
        `INSERT INTO review_actions (obligation_id, action, actor_id, actor_role, comment)
         VALUES ($1,'escalate',NULL,'system',$2)`,
        [ob.id, bodyText]);
    }
  });
  return true;
}

async function usersByRole(roles: string[]): Promise<string[]> {
  const rows = await q<{ id: string }>(
    `SELECT id FROM users WHERE role_id = ANY($1) AND status = 'active'`, [roles]);
  return rows.map(r => r.id);
}

async function countryHeadsFor(entityId: string, countryCode: string): Promise<string[]> {
  const rows = await q<{ id: string }>(
    `SELECT DISTINCT u.id FROM users u
       JOIN user_entities ue ON ue.user_id = u.id
      WHERE (ue.entity_id = $1 OR ue.entity_id = '*')
        AND u.role_id = 'COUNTRY_HEAD' AND u.status = 'active'`, [entityId]);
  if (rows.length) return rows.map(r => r.id);
  // No country head assigned to this entity — fall back to CFO Office so the
  // escalation still reaches someone rather than silently disappearing.
  return usersByRole(['CFO_OFFICE']);
}

export type EscalationSummary = { reminders: number; deptHead: number; cfo: number; auditCommittee: number };

export async function runEscalations(): Promise<EscalationSummary> {
  const summary: EscalationSummary = { reminders: 0, deptHead: 0, cfo: 0, auditCommittee: 0 };

  const candidates = await q<Candidate>(`
    SELECT o.id, o.due_date, c.risk_level, c.title, o.entity_id, e.country_code,
           o.period_label, o.assigned_to
      FROM obligations o
      JOIN compliances c ON c.id = o.compliance_id
      JOIN entities e ON e.id = o.entity_id
     WHERE o.deleted_at IS NULL
       AND o.status NOT IN ('Approved','Not Applicable')
       AND o.due_date BETWEEN CURRENT_DATE - INTERVAL '90 days' AND CURRENT_DATE + INTERVAL '15 days'`);

  const cfoIds = await usersByRole(['CFO', 'CFO_OFFICE']);
  const auditIds = await usersByRole(['AUDITOR', 'CFO']);

  for (const ob of candidates) {
    const daysUntilDue = Math.round(
      (new Date(ob.due_date).getTime() - new Date(new Date().toISOString().slice(0, 10)).getTime()) / 86_400_000);
    const daysOverdue = -daysUntilDue;

    if (daysUntilDue === 15 && ob.assigned_to) {
      const done = await fire('reminder', ob, [ob.assigned_to],
        'Filing due in 15 days',
        `${ob.title} (${ob.period_label}) is due in 15 days. File it in good time to avoid an escalation.`);
      if (done) summary.reminders++;
    }

    if (daysUntilDue === 7) {
      const heads = await countryHeadsFor(ob.entity_id, ob.country_code);
      const done = await fire('dept_head', ob, heads,
        'Escalation: filing due in 7 days',
        `${ob.title} (${ob.entity_id}, ${ob.period_label}) is still not filed with 7 days left. Escalated to the department head.`);
      if (done) summary.deptHead++;
    }

    if (daysOverdue === 1) {
      const done = await fire('cfo', ob, cfoIds,
        'Escalation: obligation now overdue',
        `${ob.title} (${ob.entity_id}, ${ob.period_label}) is now overdue with no evidence filed. Escalated to the CFO.`);
      if (done) summary.cfo++;
    }

    const significant = daysOverdue >= 14 || (daysOverdue >= 1 && ['Critical', 'High'].includes(ob.risk_level));
    if (significant) {
      const done = await fire('audit_committee', ob, auditIds,
        'Escalation: significant non-compliance',
        `${ob.title} (${ob.entity_id}, ${ob.period_label}) is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue`
        + `${['Critical', 'High'].includes(ob.risk_level) ? ` and rated ${ob.risk_level} risk` : ''}.`
        + ` Referred to the Audit Committee.`);
      if (done) summary.auditCommittee++;
    }
  }

  return summary;
}
