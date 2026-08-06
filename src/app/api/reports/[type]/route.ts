/* ===========================================================================
   REPORTS
   Every report returns JSON for on-screen display, or an Excel workbook when
   ?format=xlsx. Print to PDF from the browser for a board-ready document.
   =========================================================================== */
import { handler, ok, fail, authWith, entityFilter } from '@/lib/api';
import { q } from '@/lib/db';
import { toWorkbook } from '@/lib/excel';
import { overallScore, entityScores, countryBreakdown } from '@/lib/score';

export const dynamic = 'force-dynamic';

const TITLES: Record<string, string> = {
  country: 'Country compliance summary',
  entity: 'Entity compliance scorecard',
  division: 'Division compliance summary',
  category: 'Category compliance summary',
  overdue: 'Overdue and unfiled obligations',
  delay: 'Filing delay analysis',
  evidence: 'Evidence register',
  executive: 'Executive summary for the Board',
  board: 'Board compliance report',
};

export const GET = handler(async (req: Request, ctx: { params: { type: string } }) => {
  const u = await authWith('reports.generate');
  const type = ctx.params.type;
  if (!TITLES[type]) return fail(404, `Unknown report "${type}".`);

  const scope = entityFilter(u);
  const ids = scope ?? undefined;
  const p = new URL(req.url).searchParams;
  const wantXlsx = p.get('format') === 'xlsx';
  const sc = scope ? 'AND o.entity_id = ANY($1)' : '';
  const args = scope ? [scope] : [];

  let rows: Record<string, unknown>[] = [];
  let extraSheets: { name: string; rows: Record<string, unknown>[] }[] = [];

  if (type === 'country') {
    const cb = await countryBreakdown(ids);
    rows = cb.map(c => ({
      Country: c.countryName, Code: c.countryCode, Entities: c.entities,
      'Applicable compliances': c.total, 'Followed (approved)': c.approved,
      'Not followed': c.total - c.approved, Overdue: c.overdue,
      'Compliance score': c.score,
    }));
  }

  if (type === 'entity') {
    const [ents, scores, future] = await Promise.all([
      q<{ id: string; name: string; country_name: string; division_name: string; entity_type: string }>(
        `SELECT e.id, e.name, c.name AS country_name, d.name AS division_name, e.entity_type
           FROM entities e JOIN countries c ON c.code = e.country_code
           LEFT JOIN divisions d ON d.id = e.division_id
          WHERE e.deleted_at IS NULL ${scope ? 'AND e.id = ANY($1)' : ''}
          ORDER BY c.name, e.name`, args),
      entityScores(ids),
      /* Not-yet-due obligations, per entity — shown for disclosure only.
         They never enter the score (a period that hasn't come up yet can't
         be filed), which is exactly why "how the score is calculated" isn't
         repeated on this report — the score itself already is the answer. */
      q<{ entity_id: string; n: string }>(
        `SELECT o.entity_id, count(*) AS n FROM obligations o
          WHERE o.deleted_at IS NULL AND o.status <> 'Not Applicable' AND o.due_date > CURRENT_DATE
            ${scope ? 'AND o.entity_id = ANY($1)' : ''}
          GROUP BY o.entity_id`, args),
    ]);
    const futureByEntity = new Map(future.map(f => [f.entity_id, Number(f.n)]));
    rows = ents.map(e => {
      const s = scores[e.id];
      return {
        'Entity ID': e.id, Entity: e.name, Country: e.country_name,
        Division: e.division_name ?? '', Type: e.entity_type,
        Applicable: s?.total ?? 0, Approved: s?.approved ?? 0,
        'Awaiting review': (s?.submitted ?? 0) + (s?.underReview ?? 0),
        'Query raised': s?.queryRaised ?? 0, Rejected: s?.rejected ?? 0,
        Overdue: s?.overdue ?? 0,
        'Compliance score': s?.score ?? 0,
        'Future obligations (disclosure only, excluded from score)': futureByEntity.get(e.id) ?? 0,
      };
    });
  }

  if (type === 'division' || type === 'category') {
    const isDiv = type === 'division';
    rows = (await q(`
      SELECT ${isDiv ? `COALESCE(d.name,'Unassigned')` : 'cat.name'} AS grp,
             count(*) AS total,
             count(*) FILTER (WHERE o.status = 'Approved') AS approved,
             count(*) FILTER (WHERE o.status IN ('Submitted','Under Review')) AS in_review,
             count(*) FILTER (WHERE o.status = 'Query Raised') AS queried,
             count(*) FILTER (WHERE o.status <> 'Approved' AND o.filed_date IS NULL
                                AND o.due_date < CURRENT_DATE) AS overdue
        FROM obligations o
        JOIN entities e ON e.id = o.entity_id
        JOIN compliances c ON c.id = o.compliance_id
        JOIN categories cat ON cat.id = c.category_id
        LEFT JOIN divisions d ON d.id = e.division_id
       WHERE o.deleted_at IS NULL AND o.status <> 'Not Applicable' ${sc}
       GROUP BY grp ORDER BY grp`, args)).map(r => ({
      [isDiv ? 'Division' : 'Category']: r.grp,
      Applicable: Number(r.total), Approved: Number(r.approved),
      'Awaiting review': Number(r.in_review), 'Query raised': Number(r.queried),
      Overdue: Number(r.overdue),
      'Compliance %': Number(r.total) ? Math.round((Number(r.approved) / Number(r.total)) * 1000) / 10 : 0,
    }));
  }

  if (type === 'overdue') {
    rows = (await q(`
      SELECT e.short_name AS entity, co.name AS country, c.title,
             cat.name AS category, c.risk_level,
             o.due_date, (CURRENT_DATE - o.due_date) AS days_overdue,
             o.status, c.penalty, us.full_name AS owner
        FROM obligations o
        JOIN compliances c ON c.id = o.compliance_id
        JOIN categories cat ON cat.id = c.category_id
        JOIN entities e ON e.id = o.entity_id
        JOIN countries co ON co.code = e.country_code
        LEFT JOIN users us ON us.id = o.assigned_to
       WHERE o.deleted_at IS NULL AND o.status <> 'Approved'
         AND o.filed_date IS NULL AND o.due_date < CURRENT_DATE ${sc}
       ORDER BY (CURRENT_DATE - o.due_date) DESC`, args)).map(r => ({
      Entity: r.entity, Country: r.country, Compliance: r.title,
      Category: r.category, Risk: r.risk_level,
      'Due date': r.due_date, 'Days overdue': Number(r.days_overdue),
      Status: r.status, 'Responsible': r.owner ?? 'Unassigned',
      'Penalty exposure': r.penalty,
    }));
  }

  if (type === 'delay') {
    rows = (await q(`
      SELECT e.short_name AS entity, co.name AS country, c.title,
             cat.name AS category, o.period_label, o.due_date, o.filed_date,
             o.delay_days, o.penalty_exposure
        FROM obligations o
        JOIN compliances c ON c.id = o.compliance_id
        JOIN categories cat ON cat.id = c.category_id
        JOIN entities e ON e.id = o.entity_id
        JOIN countries co ON co.code = e.country_code
       WHERE o.deleted_at IS NULL AND o.delay_days > 0 ${sc}
       ORDER BY o.delay_days DESC`, args)).map(r => ({
      Entity: r.entity, Country: r.country, Compliance: r.title,
      Category: r.category, Period: r.period_label,
      'Due date': r.due_date, 'Filed date': r.filed_date,
      'Delay (days)': Number(r.delay_days), 'Penalty exposure': r.penalty_exposure ?? '',
    }));
  }

  if (type === 'evidence') {
    rows = (await q(`
      SELECT e.short_name AS entity, co.name AS country, c.title,
             o.period_label, ev.file_name, ev.doc_type,
             ev.status, ev.filed_date, ev.uploaded_at,
             up.full_name AS uploaded_by, rb.full_name AS reviewed_by
        FROM evidence ev
        JOIN obligations o ON o.id = ev.obligation_id
        JOIN compliances c ON c.id = o.compliance_id
        JOIN entities e ON e.id = o.entity_id
        JOIN countries co ON co.code = e.country_code
        LEFT JOIN users up ON up.id = ev.uploaded_by
        LEFT JOIN users rb ON rb.id = ev.reviewed_by
       WHERE ev.deleted_at IS NULL AND o.deleted_at IS NULL ${sc}
       ORDER BY ev.uploaded_at DESC LIMIT 5000`, args)).map(r => ({
      Entity: r.entity, Country: r.country, Compliance: r.title,
      Period: r.period_label, Document: r.file_name, 'Document type': r.doc_type ?? '',
      'Evidence status': r.status, 'Filed date': r.filed_date,
      'Uploaded at': r.uploaded_at, 'Uploaded by': r.uploaded_by ?? '',
      'Reviewed by': r.reviewed_by ?? '',
    }));
  }

  if (type === 'executive') {
    const [overall, cb, scores, ents] = await Promise.all([
      overallScore(ids), countryBreakdown(ids), entityScores(ids),
      q<{ id: string; name: string; country_name: string }>(
        `SELECT e.id, e.name, c.name AS country_name FROM entities e
           JOIN countries c ON c.code = e.country_code
          WHERE e.deleted_at IS NULL ${scope ? 'AND e.id = ANY($1)' : ''}`, args),
    ]);
    rows = [{
      Metric: 'Group compliance score', Value: overall.score,
      Basis: `${overall.approved} of ${overall.total} applicable obligations carry approved evidence`,
    }, {
      Metric: 'Evidence coverage', Value: `${overall.evidenceCoverage}%`,
      Basis: 'Applicable obligations with at least one uploaded document',
    }, {
      Metric: 'On-time filing rate', Value: `${overall.onTimeRate}%`,
      Basis: 'Filed on or before the statutory due date',
    }, {
      Metric: 'Overdue and unfiled', Value: overall.overdue,
      Basis: 'Past due date with no evidence uploaded',
    }, {
      Metric: 'Awaiting reviewer', Value: overall.submitted + overall.underReview,
      Basis: 'Submitted with evidence, pending review',
    }, {
      Metric: 'Queries open with preparers', Value: overall.queryRaised,
      Basis: 'Reviewer raised a query and returned the item',
    }, {
      Metric: 'Average filing delay', Value: `${overall.avgDelayDays} days`,
      Basis: 'Across obligations filed after the due date',
    }];
    extraSheets = [
      { name: 'By country', rows: cb.map(c => ({
        Country: c.countryName, Entities: c.entities, Applicable: c.total,
        Followed: c.approved, Overdue: c.overdue, Score: c.score })) },
      { name: 'By entity', rows: ents.map(e => ({
        Entity: e.name, Country: e.country_name,
        Applicable: scores[e.id]?.total ?? 0, Approved: scores[e.id]?.approved ?? 0,
        Overdue: scores[e.id]?.overdue ?? 0, Score: scores[e.id]?.score ?? 0 })) },
    ];
  }

  if (type === 'board') {
    /* A board pack: the headline position, then the evidence behind it. */
    const [overall, cb, scores, ents, highRisk, changes, revs] = await Promise.all([
      overallScore(ids),
      countryBreakdown(ids),
      entityScores(ids),
      q<{ id: string; name: string; country_name: string; division_name: string | null }>(
        `SELECT e.id, e.name, c.name AS country_name, d.name AS division_name
           FROM entities e
           JOIN countries c ON c.code = e.country_code
           LEFT JOIN divisions d ON d.id = e.division_id
          WHERE e.deleted_at IS NULL ${scope ? 'AND e.id = ANY($1)' : ''}
          ORDER BY c.name, e.name`, args),
      q<{ entity_name: string; country_name: string; title: string; authority: string;
          due_date: string; days_overdue: number; penalty: string | null }>(
        `SELECT e.name AS entity_name, c.name AS country_name, cm.title, cm.authority,
                o.due_date, (CURRENT_DATE - o.due_date) AS days_overdue, cm.penalty
           FROM obligations o
           JOIN compliances cm ON cm.id = o.compliance_id
           JOIN entities e ON e.id = o.entity_id
           JOIN countries c ON c.code = e.country_code
          WHERE o.deleted_at IS NULL AND cm.risk_level = 'High'
            AND o.filed_date IS NULL AND o.due_date < CURRENT_DATE ${sc}
          ORDER BY o.due_date ASC LIMIT 100`, args),
      q<{ title: string; entity_name: string; old_due_date: string; new_due_date: string;
          reason: string | null; changed_at: string }>(
        `SELECT cm.title, e.name AS entity_name, dc.old_due_date, dc.new_due_date,
                dc.reason, dc.changed_at
           FROM due_date_changes dc
           JOIN obligations o ON o.id = dc.obligation_id
           JOIN compliances cm ON cm.id = o.compliance_id
           JOIN entities e ON e.id = o.entity_id
          WHERE 1=1 ${sc}
          ORDER BY dc.changed_at DESC LIMIT 60`, args),
      q<{ reviewer: string; approved: number; rejected: number; queries: number; avg_days: number }>(
        `SELECT u.full_name AS reviewer,
                COUNT(*) FILTER (WHERE ra.action = 'approve')  AS approved,
                COUNT(*) FILTER (WHERE ra.action = 'reject')   AS rejected,
                COUNT(*) FILTER (WHERE ra.action = 'query')    AS queries,
                COALESCE(ROUND((AVG(EXTRACT(EPOCH FROM (ra.created_at - o.created_at)) / 86400.0)
                  FILTER (WHERE ra.action = 'approve'))::numeric, 1), 0) AS avg_days
           FROM review_actions ra
           JOIN users u ON u.id = ra.actor_id
           JOIN obligations o ON o.id = ra.obligation_id
          WHERE ra.action IN ('approve','reject','query') ${sc}
          GROUP BY u.full_name HAVING COUNT(*) > 0
          ORDER BY approved DESC`, args),
    ]);

    const band = overall.score >= 90 ? 'Strong'
      : overall.score >= 75 ? 'Satisfactory'
      : overall.score >= 60 ? 'Needs attention' : 'Unsatisfactory';

    rows = [
      { Item: 'Reporting date', Detail: new Date().toISOString().slice(0, 10) },
      { Item: 'Entities in scope', Detail: ents.length },
      { Item: 'Countries in scope', Detail: cb.length },
      { Item: 'Applicable obligations', Detail: overall.total },
      { Item: 'Group compliance score', Detail: `${overall.score} / 100 (${band})` },
      { Item: 'Obligations with approved evidence', Detail: `${overall.approved} (${overall.total ? Math.round(overall.approved / overall.total * 100) : 0}%)` },
      { Item: 'Evidence coverage', Detail: `${overall.evidenceCoverage}%` },
      { Item: 'On-time filing rate', Detail: `${overall.onTimeRate}%` },
      { Item: 'Overdue and unfiled', Detail: overall.overdue },
      { Item: 'High-risk items overdue', Detail: highRisk.length },
      { Item: 'Awaiting reviewer', Detail: overall.submitted + overall.underReview },
      { Item: 'Open queries with preparers', Detail: overall.queryRaised },
      { Item: 'Average filing delay', Detail: `${overall.avgDelayDays} days` },
      { Item: 'Due-date changes tracked', Detail: changes.length },
      { Item: 'Basis of assurance', Detail: 'Uploaded documentary evidence reviewed and approved in-platform. No representation letters relied upon.' },
    ];

    const weakest = ents
      .map(e => ({ e, s: scores[e.id] }))
      .filter(x => x.s)
      .sort((a, b) => (a.s!.score) - (b.s!.score))
      .slice(0, 10);

    extraSheets = [
      { name: 'Country position', rows: cb.map(c => ({
          Country: c.countryName, Code: c.countryCode, Entities: c.entities,
          'Applicable compliances': c.total, 'Followed': c.approved,
          'Not followed': c.total - c.approved, Overdue: c.overdue, Score: c.score })) },
      { name: 'Entity scorecard', rows: ents.map(e => ({
          Entity: e.name, Country: e.country_name, Division: e.division_name ?? '—',
          Applicable: scores[e.id]?.total ?? 0, Approved: scores[e.id]?.approved ?? 0,
          Overdue: scores[e.id]?.overdue ?? 0, Score: scores[e.id]?.score ?? 0 })) },
      { name: 'Lowest scoring entities', rows: weakest.map((x, i) => ({
          Rank: i + 1, Entity: x.e.name, Country: x.e.country_name,
          Score: x.s!.score, Approved: x.s!.approved, Applicable: x.s!.total,
          Overdue: x.s!.overdue })) },
      { name: 'High risk overdue', rows: highRisk.map(r => ({
          Entity: r.entity_name, Country: r.country_name, Compliance: r.title,
          Authority: r.authority, 'Due date': r.due_date,
          'Days overdue': r.days_overdue, 'Penalty exposure': r.penalty ?? '—' })) },
      { name: 'Due date changes', rows: changes.map(r => ({
          Compliance: r.title, Entity: r.entity_name, 'Previous due date': r.old_due_date,
          'Revised due date': r.new_due_date, Reason: r.reason ?? '—',
          'Recorded at': r.changed_at })) },
      { name: 'Reviewer throughput', rows: revs.map(r => ({
          Reviewer: r.reviewer, Approved: r.approved, Rejected: r.rejected,
          'Queries raised': r.queries, 'Avg days to approve': r.avg_days })) },
    ];
  }

  if (wantXlsx) {
    const buf = toWorkbook([{ name: TITLES[type].slice(0, 28), rows }, ...extraSheets]);
    const fname = type === 'executive'
      ? 'Executive summary.xlsx'
      : `SGCMP_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(new Uint8Array(buf), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${fname}"`,
        'cache-control': 'no-store',
      },
    });
  }

  return ok({ type, title: TITLES[type], rows, extraSheets, generatedAt: new Date().toISOString(), generatedBy: u.name });
});
