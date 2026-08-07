/* ===========================================================================
   COMPLIANCE SCORE ENGINE
   The platform's headline output. This replaces the representation letter: the
   score is derived only from obligations that carry approved documentary
   evidence, so it cannot be inflated by self-declaration.

   score = 100 * (approved obligations / applicable obligations)
           with deductions for overdue items and filing delays.
   Every component is returned so the number is always explainable.

   Every aggregate below can additionally be scoped to a single financial
   year (fy_start_year) — the dashboard's FY selector passes this through so
   "Applicable obligations" reflects one FY's filings, not every FY ever
   generated. Omitting fy keeps the previous "all FYs" behaviour.
   =========================================================================== */
import { q } from './db';

export type ScoreBreakdown = {
  total: number;
  approved: number;
  submitted: number;
  underReview: number;
  queryRaised: number;
  rejected: number;
  evidencePending: number;
  notStarted: number;
  overdue: number;
  filedLate: number;
  avgDelayDays: number;
  evidenceCoverage: number;   // % of applicable obligations with at least one file
  onTimeRate: number;         // % of filed obligations filed on or before due date
  base: number;               // approved / total
  overduePenalty: number;
  delayPenalty: number;
  score: number;
};

type Agg = {
  entity_id: string;
  total: string; approved: string; submitted: string; under_review: string;
  query_raised: string; rejected: string; evidence_pending: string; not_started: string;
  overdue: string; filed_late: string; avg_delay: string | null;
  with_evidence: string; filed_total: string; filed_ontime: string;
  in_review_ct: string;
};

/** Builds the `entity_id = ANY(...)` / `fy_start_year = ...` filter shared by
    every aggregate query below, with placeholder numbers that always match
    the values array — so callers never have to track $1/$2 by hand. */
function scopeFilter(entityIds?: string[], fy?: number): { sql: string; vals: unknown[] } {
  const vals: unknown[] = [];
  const parts: string[] = [];
  if (entityIds && entityIds.length) { vals.push(entityIds); parts.push(`AND o.entity_id = ANY($${vals.length})`); }
  if (fy != null) { vals.push(fy); parts.push(`AND o.fy_start_year = $${vals.length}`); }
  return { sql: parts.join(' '), vals };
}

/* The select list is shared; entity_id is added only when grouping by entity.
   Only counts obligations that are actually due by today — a period that
   hasn't come up yet can't be filed, so it shouldn't count against the score
   (or appear as "applicable") until its due date arrives. */
function aggSql(groupByEntity: boolean, extraWhere = ''): string {
  return `
  SELECT ${groupByEntity ? 'o.entity_id,' : `'' AS entity_id,`}
         count(*)                                                        AS total,
         count(*) FILTER (WHERE o.status = 'Approved')                    AS approved,
         count(*) FILTER (WHERE o.status = 'Submitted')                   AS submitted,
         count(*) FILTER (WHERE o.status = 'Under Review')                AS under_review,
         count(*) FILTER (WHERE o.status = 'Query Raised')                AS query_raised,
         count(*) FILTER (WHERE o.status = 'Rejected')                    AS rejected,
         count(*) FILTER (WHERE o.status = 'Evidence Pending')            AS evidence_pending,
         count(*) FILTER (WHERE o.status = 'Not Started')                 AS not_started,
         count(*) FILTER (WHERE o.status <> 'Approved'
                            AND o.status <> 'Not Applicable'
                            AND o.filed_date IS NULL
                            AND o.due_date < CURRENT_DATE)                AS overdue,
         count(*) FILTER (WHERE o.status IN ('Submitted','Under Review')) AS in_review_ct,
         count(*) FILTER (WHERE o.filed_date IS NOT NULL
                            AND o.filed_date > o.due_date)                AS filed_late,
         avg(NULLIF(o.delay_days, 0)) FILTER (WHERE o.delay_days > 0)     AS avg_delay,
         count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM evidence e WHERE e.obligation_id = o.id AND e.deleted_at IS NULL))
                                                                          AS with_evidence,
         count(*) FILTER (WHERE o.filed_date IS NOT NULL)                 AS filed_total,
         count(*) FILTER (WHERE o.filed_date IS NOT NULL
                            AND o.filed_date <= o.due_date)               AS filed_ontime
    FROM obligations o
   WHERE o.deleted_at IS NULL
     AND o.status <> 'Not Applicable'
     AND o.due_date <= CURRENT_DATE
     ${extraWhere}
   ${groupByEntity ? 'GROUP BY o.entity_id' : ''}`;
}

function build(a: Agg): ScoreBreakdown {
  const n = (v: string | null) => Number(v ?? 0);
  const total = n(a.total);
  const approved = n(a.approved);
  const overdue = n(a.overdue);
  const filedTotal = n(a.filed_total);
  const avgDelay = a.avg_delay ? Number(a.avg_delay) : 0;

  const base = total ? (approved / total) * 100 : 0;
  // Overdue items bite harder than slow ones: up to 15 points.
  const overduePenalty = total ? Math.min(15, (overdue / total) * 100 * 0.5) : 0;
  // Chronic lateness costs up to 5 points.
  const delayPenalty = Math.min(5, avgDelay / 6);
  const score = Math.max(0, Math.min(100, base - overduePenalty - delayPenalty));

  return {
    total,
    approved,
    submitted: n(a.submitted),
    underReview: n(a.under_review),
    queryRaised: n(a.query_raised),
    rejected: n(a.rejected),
    evidencePending: n(a.evidence_pending),
    notStarted: n(a.not_started),
    overdue,
    filedLate: n(a.filed_late),
    avgDelayDays: Math.round(avgDelay * 10) / 10,
    evidenceCoverage: total ? Math.round((n(a.with_evidence) / total) * 1000) / 10 : 0,
    onTimeRate: filedTotal ? Math.round((n(a.filed_ontime) / filedTotal) * 1000) / 10 : 0,
    base: Math.round(base * 10) / 10,
    overduePenalty: Math.round(overduePenalty * 10) / 10,
    delayPenalty: Math.round(delayPenalty * 10) / 10,
    score: Math.round(score * 10) / 10,
  };
}

export async function entityScores(
  entityIds?: string[], fy?: number
): Promise<Record<string, ScoreBreakdown>> {
  const { sql, vals } = scopeFilter(entityIds, fy);
  const rows = await q<Agg>(aggSql(true, sql), vals);
  const out: Record<string, ScoreBreakdown> = {};
  rows.forEach(r => { out[r.entity_id] = build(r); });
  return out;
}

export async function overallScore(entityIds?: string[], fy?: number): Promise<ScoreBreakdown> {
  const { sql, vals } = scopeFilter(entityIds, fy);
  const rows = await q<Agg>(aggSql(false, sql), vals);
  if (!rows.length) {
    return build({
      entity_id: '', total: '0', approved: '0', submitted: '0', under_review: '0',
      query_raised: '0', rejected: '0', evidence_pending: '0', not_started: '0',
      overdue: '0', filed_late: '0', avg_delay: null, with_evidence: '0',
      filed_total: '0', filed_ontime: '0', in_review_ct: '0',
    });
  }
  return build(rows[0]);
}

/* The same breakdown as entityScores/overallScore, grouped by country instead
   — lets the dashboard's country filter re-scope the headline score exactly,
   with no client-side approximation. */
function aggSqlByCountry(extraWhere = ''): string {
  return `
  SELECT e.country_code AS entity_id,
         count(*)                                                        AS total,
         count(*) FILTER (WHERE o.status = 'Approved')                    AS approved,
         count(*) FILTER (WHERE o.status = 'Submitted')                   AS submitted,
         count(*) FILTER (WHERE o.status = 'Under Review')                AS under_review,
         count(*) FILTER (WHERE o.status = 'Query Raised')                AS query_raised,
         count(*) FILTER (WHERE o.status = 'Rejected')                    AS rejected,
         count(*) FILTER (WHERE o.status = 'Evidence Pending')            AS evidence_pending,
         count(*) FILTER (WHERE o.status = 'Not Started')                 AS not_started,
         count(*) FILTER (WHERE o.status <> 'Approved'
                            AND o.status <> 'Not Applicable'
                            AND o.filed_date IS NULL
                            AND o.due_date < CURRENT_DATE)                AS overdue,
         count(*) FILTER (WHERE o.status IN ('Submitted','Under Review')) AS in_review_ct,
         count(*) FILTER (WHERE o.filed_date IS NOT NULL
                            AND o.filed_date > o.due_date)                AS filed_late,
         avg(NULLIF(o.delay_days, 0)) FILTER (WHERE o.delay_days > 0)     AS avg_delay,
         count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM evidence e2 WHERE e2.obligation_id = o.id AND e2.deleted_at IS NULL))
                                                                          AS with_evidence,
         count(*) FILTER (WHERE o.filed_date IS NOT NULL)                 AS filed_total,
         count(*) FILTER (WHERE o.filed_date IS NOT NULL
                            AND o.filed_date <= o.due_date)               AS filed_ontime
    FROM obligations o
    JOIN entities e ON e.id = o.entity_id
   WHERE o.deleted_at IS NULL
     AND o.status <> 'Not Applicable'
     AND o.due_date <= CURRENT_DATE
     ${extraWhere}
   GROUP BY e.country_code`;
}

export async function countryScores(entityIds?: string[], fy?: number): Promise<Record<string, ScoreBreakdown>> {
  const { sql, vals } = scopeFilter(entityIds, fy);
  const rows = await q<Agg>(aggSqlByCountry(sql), vals);
  const out: Record<string, ScoreBreakdown> = {};
  rows.forEach(r => { out[r.entity_id] = build(r); });
  return out;
}

/* Same breakdown again, grouped by compliance category — lets the dashboard's
   category tabs show their own Evidence coverage / On-time filing / Awaiting
   review / Average delay, not just the group-wide numbers, when a tab is
   selected. */
function aggSqlByCategory(extraWhere = ''): string {
  return `
  SELECT cat.name AS entity_id,
         count(*)                                                        AS total,
         count(*) FILTER (WHERE o.status = 'Approved')                    AS approved,
         count(*) FILTER (WHERE o.status = 'Submitted')                   AS submitted,
         count(*) FILTER (WHERE o.status = 'Under Review')                AS under_review,
         count(*) FILTER (WHERE o.status = 'Query Raised')                AS query_raised,
         count(*) FILTER (WHERE o.status = 'Rejected')                    AS rejected,
         count(*) FILTER (WHERE o.status = 'Evidence Pending')            AS evidence_pending,
         count(*) FILTER (WHERE o.status = 'Not Started')                 AS not_started,
         count(*) FILTER (WHERE o.status <> 'Approved'
                            AND o.status <> 'Not Applicable'
                            AND o.filed_date IS NULL
                            AND o.due_date < CURRENT_DATE)                AS overdue,
         count(*) FILTER (WHERE o.status IN ('Submitted','Under Review')) AS in_review_ct,
         count(*) FILTER (WHERE o.filed_date IS NOT NULL
                            AND o.filed_date > o.due_date)                AS filed_late,
         avg(NULLIF(o.delay_days, 0)) FILTER (WHERE o.delay_days > 0)     AS avg_delay,
         count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM evidence e2 WHERE e2.obligation_id = o.id AND e2.deleted_at IS NULL))
                                                                          AS with_evidence,
         count(*) FILTER (WHERE o.filed_date IS NOT NULL)                 AS filed_total,
         count(*) FILTER (WHERE o.filed_date IS NOT NULL
                            AND o.filed_date <= o.due_date)               AS filed_ontime
    FROM obligations o
    JOIN compliances c ON c.id = o.compliance_id
    JOIN categories cat ON cat.id = c.category_id
   WHERE o.deleted_at IS NULL
     AND o.status <> 'Not Applicable'
     AND o.due_date <= CURRENT_DATE
     ${extraWhere}
   GROUP BY cat.name`;
}

export async function categoryScores(entityIds?: string[], fy?: number): Promise<Record<string, ScoreBreakdown>> {
  const { sql, vals } = scopeFilter(entityIds, fy);
  const rows = await q<Agg>(aggSqlByCategory(sql), vals);
  const out: Record<string, ScoreBreakdown> = {};
  rows.forEach(r => { out[r.entity_id] = build(r); });
  return out;
}

export type CountryRow = {
  countryCode: string;
  countryName: string;
  entities: number;
  total: number;
  approved: number;
  overdue: number;
  score: number;
};

/** Country-wise applicable vs followed — the CFO "Overall" tab and the
    country/executive/board reports. Scores come from countryScores(), which
    runs through the same build() formula (including the delay penalty) as
    every entity and overall score — country, entity and overall figures
    must always foot to the same numbers when scoped the same way. */
export async function countryBreakdown(entityIds?: string[], fy?: number): Promise<CountryRow[]> {
  const { sql, vals } = scopeFilter(entityIds, fy);
  const [names, scores] = await Promise.all([
    q<{ country_code: string; country_name: string; entities: string }>(
      `SELECT c.code AS country_code, c.name AS country_name,
              count(DISTINCT o.entity_id) AS entities
         FROM obligations o
         JOIN entities e ON e.id = o.entity_id
         JOIN countries c ON c.code = e.country_code
        WHERE o.deleted_at IS NULL AND o.status <> 'Not Applicable'
          AND o.due_date <= CURRENT_DATE ${sql}
        GROUP BY c.code, c.name
        ORDER BY c.name`,
      vals),
    countryScores(entityIds, fy),
  ]);
  return names.map(r => {
    const s = scores[r.country_code] ?? null;
    return {
      countryCode: r.country_code,
      countryName: r.country_name,
      entities: Number(r.entities),
      total: s?.total ?? 0, approved: s?.approved ?? 0, overdue: s?.overdue ?? 0,
      score: s?.score ?? 0,
    };
  });
}

export type TrendPoint = { label: string; monthEnd: string; score: number; total: number; approved: number; overdue: number };

/** The score "as of" a past date, reconstructed from the real timestamps on
    each obligation and its evidence rather than a daily snapshot job — an
    obligation counts as approved as of that date only if a reviewer had
    already approved its evidence by then, and as overdue only if it was
    still unfiled by then. This lets the dashboard show a genuine month-on-
    month trend from day one, with no history-gathering period required. */
async function scoreAsOf(asOf: string, entityIds?: string[]): Promise<ScoreBreakdown> {
  const vals: unknown[] = [asOf];
  let scopeSql = '';
  if (entityIds && entityIds.length) { vals.push(entityIds); scopeSql = `AND o.entity_id = ANY($${vals.length})`; }

  const rows = await q<Agg>(`
    SELECT '' AS entity_id,
           count(*) AS total,
           count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM evidence e WHERE e.obligation_id = o.id AND e.deleted_at IS NULL
                AND e.status = 'Approved' AND e.reviewed_at <= $1::date)) AS approved,
           '0' AS submitted, '0' AS under_review, '0' AS query_raised,
           '0' AS evidence_pending, '0' AS not_started, '0' AS in_review_ct,
           count(*) FILTER (WHERE o.due_date < $1::date
                              AND (o.filed_date IS NULL OR o.filed_date > $1::date)
                              AND NOT EXISTS (
                                SELECT 1 FROM evidence e2 WHERE e2.obligation_id = o.id AND e2.deleted_at IS NULL
                                  AND e2.status = 'Approved' AND e2.reviewed_at <= $1::date)) AS overdue,
           count(*) FILTER (WHERE o.filed_date IS NOT NULL AND o.filed_date <= $1::date
                              AND o.filed_date > o.due_date) AS filed_late,
           avg(NULLIF(o.delay_days, 0)) FILTER (WHERE o.delay_days > 0
                              AND o.filed_date IS NOT NULL AND o.filed_date <= $1::date) AS avg_delay,
           count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM evidence e3 WHERE e3.obligation_id = o.id AND e3.deleted_at IS NULL
                AND e3.uploaded_at <= $1::date)) AS with_evidence,
           count(*) FILTER (WHERE o.filed_date IS NOT NULL AND o.filed_date <= $1::date) AS filed_total,
           count(*) FILTER (WHERE o.filed_date IS NOT NULL AND o.filed_date <= $1::date
                              AND o.filed_date <= o.due_date) AS filed_ontime
      FROM obligations o
     WHERE o.deleted_at IS NULL AND o.status <> 'Not Applicable' AND o.due_date <= $1::date
       ${scopeSql}`, vals);

  return build(rows[0] ?? {
    entity_id: '', total: '0', approved: '0', submitted: '0', under_review: '0',
    query_raised: '0', rejected: '0', evidence_pending: '0', not_started: '0',
    overdue: '0', filed_late: '0', avg_delay: null, with_evidence: '0',
    filed_total: '0', filed_ontime: '0', in_review_ct: '0',
  });
}

export async function monthlyTrend(entityIds?: string[], months = 6): Promise<TrendPoint[]> {
  const now = new Date();
  const monthEnds: Date[] = [];
  for (let i = months - 1; i >= 0; i--) {
    monthEnds.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0)));
  }
  const scores = await Promise.all(monthEnds.map(d => scoreAsOf(d.toISOString().slice(0, 10), entityIds)));
  return monthEnds.map((d, i) => ({
    label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
    monthEnd: d.toISOString().slice(0, 10),
    score: scores[i].score, total: scores[i].total, approved: scores[i].approved, overdue: scores[i].overdue,
  }));
}

export function scoreBand(score: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (score >= 90) return { label: 'Strong', tone: 'good' };
  if (score >= 75) return { label: 'Acceptable', tone: 'warn' };
  return { label: 'Needs attention', tone: 'bad' };
}
