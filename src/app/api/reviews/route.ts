/* ===========================================================================
   REVIEW ACTIONS
   The reviewer's portal. Every action is recorded with who, when, from/to
   status and a comment, and the preparer is notified. A query sends the item
   back to the preparer rather than closing it.
   =========================================================================== */
import { handler, ok, fail, auth, body, writeAudit } from '@/lib/api';
import { q, one, tx } from '@/lib/db';
import { canFileEntity, canReviewEntity, canSeeEntity } from '@/lib/rbac';
import { MIN_REMARK_LENGTH } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/* Target turnaround for a review, in hours. Matches the first rung of the
   escalation matrix (a reminder once evidence has sat unreviewed for two
   days), so the workbench and the escalation job describe the same promise. */
const SLA_REVIEW_HOURS = 48;

type Action = 'approve' | 'reject' | 'query' | 'comment' | 'escalate' | 'reopen' | 'resubmit';

const TRANSITION: Record<Action, { to: string | null; stage: string | null; needsComment: boolean }> = {
  approve:  { to: 'Approved',     stage: 'closed',   needsComment: false },
  reject:   { to: 'Rejected',     stage: 'preparer', needsComment: true  },
  query:    { to: 'Query Raised', stage: 'preparer', needsComment: true  },
  comment:  { to: null,           stage: null,       needsComment: true  },
  escalate: { to: null,           stage: 'country_head', needsComment: true },
  reopen:   { to: 'Under Review', stage: 'reviewer', needsComment: true  },
  resubmit: { to: 'Submitted',    stage: 'reviewer', needsComment: false },
};

export const GET = handler(async () => {
  const u = await auth();
  const all = u.canReview.includes('*');
  const rows = await q(`
    SELECT o.id, o.reference, o.period_label, o.due_date, o.filed_date, o.status,
           o.delay_days, o.penalty_exposure, o.workflow_stage,
           c.code, c.title, c.form_reference, c.risk_level, c.penalty, c.evidence_required,
           cat.name AS category, e.id AS entity_id, e.short_name AS entity, e.country_code,
           pu.full_name AS preparer, rv.full_name AS reviewer,
           (SELECT count(*) FROM evidence ev WHERE ev.obligation_id = o.id AND ev.deleted_at IS NULL) AS files,
           (SELECT ev.validation FROM evidence ev WHERE ev.obligation_id = o.id
              AND ev.deleted_at IS NULL ORDER BY ev.version DESC LIMIT 1) AS validation,
           (SELECT max(ev.uploaded_at) FROM evidence ev WHERE ev.obligation_id = o.id AND ev.deleted_at IS NULL) AS submitted_at
      FROM obligations o
      JOIN compliances c ON c.id = o.compliance_id
      JOIN categories cat ON cat.id = c.category_id
      JOIN entities e ON e.id = o.entity_id
      LEFT JOIN users pu ON pu.id = o.assigned_to
      LEFT JOIN users rv ON rv.id = o.reviewer_id
     WHERE o.deleted_at IS NULL
       AND o.status IN ('Submitted','Under Review','Query Raised','Rejected')
       ${all ? '' : 'AND o.entity_id = ANY($1)'}
     ORDER BY
       CASE o.status WHEN 'Submitted' THEN 1 WHEN 'Under Review' THEN 2 ELSE 3 END,
       o.due_date`, all ? [] : [u.canReview]);

  /* ------------------------------------------------------------------ B8
     The reviewer's own performance, over a rolling 90 days. Review time is
     measured from the submission that put the item in front of them to the
     decision they took on it — not from the obligation's creation, which
     would charge the reviewer for however long the preparer sat on it.

     A decision is matched to the most recent 'submit' that preceded it, so a
     query-and-resubmit cycle is counted as two separate reviews rather than
     one very slow one. */
  const stats = await one<{
    decisions: string; approved: string; queried: string; rejected: string;
    avg_hours: string | null; within_sla: string; measured: string;
  }>(`
    WITH decided AS (
      SELECT ra.action,
             ra.created_at AS decided_at,
             (SELECT max(s.created_at)
                FROM review_actions s
               WHERE s.obligation_id = ra.obligation_id
                 AND s.action = 'submit'
                 AND s.created_at <= ra.created_at) AS submitted_at
        FROM review_actions ra
        JOIN obligations o ON o.id = ra.obligation_id
       WHERE ra.actor_id = $1
         AND ra.action IN ('approve','reject','query')
         AND ra.created_at > now() - INTERVAL '90 days'
         AND o.deleted_at IS NULL
    )
    SELECT count(*)                                                   AS decisions,
           count(*) FILTER (WHERE action = 'approve')                 AS approved,
           count(*) FILTER (WHERE action = 'query')                   AS queried,
           count(*) FILTER (WHERE action = 'reject')                  AS rejected,
           count(*) FILTER (WHERE submitted_at IS NOT NULL)           AS measured,
           avg(EXTRACT(EPOCH FROM (decided_at - submitted_at)) / 3600)
             FILTER (WHERE submitted_at IS NOT NULL)                  AS avg_hours,
           count(*) FILTER (WHERE submitted_at IS NOT NULL
                              AND decided_at - submitted_at <= INTERVAL '${SLA_REVIEW_HOURS} hours') AS within_sla
      FROM decided`, [u.id]);

  const measured = Number(stats?.measured ?? 0);
  return ok({
    queue: rows,
    canReviewAll: all,
    slaHours: SLA_REVIEW_HOURS,
    stats: {
      decisions: Number(stats?.decisions ?? 0),
      approved: Number(stats?.approved ?? 0),
      queried: Number(stats?.queried ?? 0),
      rejected: Number(stats?.rejected ?? 0),
      avgHours: stats?.avg_hours ? Math.round(Number(stats.avg_hours) * 10) / 10 : null,
      slaRate: measured ? Math.round((Number(stats?.within_sla ?? 0) / measured) * 1000) / 10 : null,
      measured,
    },
  });
});

export const POST = handler(async (req: Request) => {
  const u = await auth();
  const b = await body<{
    obligationId: string; action: Action; comment?: string; evidenceId?: string;
  }>(req);

  if (!b.obligationId) return fail(400, 'Obligation reference is missing.');
  const rule = TRANSITION[b.action];
  if (!rule) return fail(400, `"${b.action}" is not a recognised review action.`);
  if (rule.needsComment && !b.comment?.trim())
    return fail(400, b.action === 'query'
      ? 'Describe the query so the preparer knows what to correct.'
      : 'A comment is required for this action.');
  /* Query and escalate are always free text, so a remark that's required at
     all must actually explain something, not just clear a non-empty check.
     Reject is deliberately exempt here: it's a fixed reason picked from a
     dropdown (see REJECT_REASONS) rather than a remark, and several of those
     reasons are themselves under 25 characters — only the optional "Others"
     follow-up remark needs the length check, which the client already
     enforces before it ever reaches this comment string. */
  if (['query', 'escalate'].includes(b.action) && b.comment && b.comment.trim().length < MIN_REMARK_LENGTH)
    return fail(400, `The comment needs at least ${MIN_REMARK_LENGTH} characters.`);

  const obl = await one<{ entity_id: string; status: string; assigned_to: string | null;
    title: string; country_code: string; period_label: string }>(
    `SELECT o.entity_id, o.status, o.assigned_to, c.title, e.country_code, o.period_label
       FROM obligations o JOIN compliances c ON c.id = o.compliance_id
       JOIN entities e ON e.id = o.entity_id
      WHERE o.id = $1 AND o.deleted_at IS NULL`, [b.obligationId]);
  if (!obl) return fail(404, 'Obligation not found.');
  if (!canSeeEntity(u, obl.entity_id)) return fail(403, 'You are not assigned to this entity.');

  /* Three tiers of authority on an obligation:
       comment   — anyone who can see the entity
       resubmit  — the person responsible for filing, once an item comes back
       decisions — approve / reject / query / escalate / reopen need review rights */
  if (b.action === 'resubmit') {
    if (!canFileEntity(u, obl.entity_id) && !canReviewEntity(u, obl.entity_id))
      return fail(403, 'Only the person responsible for filing this obligation can resubmit it.');
    if (!['Query Raised', 'Rejected', 'Returned'].includes(obl.status))
      return fail(400, `This obligation is "${obl.status}" — there is nothing to resubmit.`);
  } else if (b.action !== 'comment' && !canReviewEntity(u, obl.entity_id)) {
    return fail(403, 'You do not have review authority for this entity. The CFO can delegate it to you.');
  }

  await tx(async c => {
    if (rule.to || rule.stage) {
      await c.query(
        `UPDATE obligations
            SET status = COALESCE($2, status),
                workflow_stage = COALESCE($3, workflow_stage)
          WHERE id = $1`, [b.obligationId, rule.to, rule.stage]);
    }

    if (b.action === 'approve') {
      await c.query(
        `UPDATE evidence SET status = 'Approved', reviewed_by = $2, reviewed_at = now()
          WHERE obligation_id = $1 AND deleted_at IS NULL AND status = 'Submitted'`,
        [b.obligationId, u.id]);
    }
    if (b.action === 'reject') {
      await c.query(
        `UPDATE evidence SET status = 'Rejected', reviewed_by = $2, reviewed_at = now()
          WHERE obligation_id = $1 AND deleted_at IS NULL AND status = 'Submitted'`,
        [b.obligationId, u.id]);
    }

    await c.query(
      `INSERT INTO review_actions (obligation_id, evidence_id, action, actor_id, actor_role,
          from_status, to_status, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [b.obligationId, b.evidenceId ?? null, b.action, u.id, u.role,
       obl.status, rule.to ?? obl.status, b.comment ?? null]);

    /* notify the preparer on anything that needs their attention */
    if (obl.assigned_to && ['reject', 'query', 'approve'].includes(b.action)) {
      const sev = b.action === 'approve' ? 'info' : 'warning';
      const title = b.action === 'approve' ? 'Compliance approved'
        : b.action === 'query' ? 'Query raised on your submission'
        : 'Submission rejected';
      await c.query(
        `INSERT INTO notifications (user_id, country_code, entity_id, kind, title, body, link, severity, is_popup)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [obl.assigned_to, obl.country_code, obl.entity_id, `review_${b.action}`, title,
         `${obl.title} (${obl.period_label}) — ${u.name}: ${b.comment ?? 'Approved.'}`,
         `/register?obligation=${b.obligationId}`, sev, b.action !== 'approve']);
    }

    /* escalation goes to every country head for that country */
    if (b.action === 'escalate') {
      const heads = await c.query<{ user_id: string }>(
        `SELECT DISTINCT ue.user_id FROM user_entities ue
           JOIN users us ON us.id = ue.user_id
          WHERE (ue.entity_id = $1 OR ue.entity_id = '*')
            AND us.role_id IN ('COUNTRY_HEAD','CFO_OFFICE','CFO')
            AND us.status = 'active'`, [obl.entity_id]);
      for (const h of heads.rows) {
        await c.query(
          `INSERT INTO notifications (user_id, country_code, entity_id, kind, title, body, link, severity, is_popup)
           VALUES ($1,$2,$3,'escalation',$4,$5,$6,'critical',TRUE)`,
          [h.user_id, obl.country_code, obl.entity_id, 'Compliance escalated',
           `${obl.title} (${obl.entity_id}, ${obl.period_label}) escalated by ${u.name}: ${b.comment}`,
           `/reviews?obligation=${b.obligationId}`]);
      }
    }
  });

  await writeAudit({ actor: u, action: `review.${b.action}`, objectType: 'obligation',
    objectId: b.obligationId, detail: `${obl.title} — ${b.comment ?? ''}`.slice(0, 400) });

  return ok({ ok: true, status: rule.to ?? obl.status, action: b.action });
});
