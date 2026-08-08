/* ===========================================================================
   COMPLIANCE SCORE ENGINE  (Phase A — weighted, modules A1 / A2 / A3)
   ---------------------------------------------------------------------------
   The platform's headline output. The score is derived only from obligations
   that carry reviewer-approved evidence, so it cannot be inflated by
   self-declaration.

   Until v1.1 the score was a flat ratio — approved ÷ applicable, less two
   penalties. That treated a missed GST return and a late professional-tax
   return as the same event, and treated an approval backed by a government
   acknowledgement as identical to one backed by a screenshot.

   It is now a weighted engine:

       score = Σ (outcome points × criticality) / Σ (100 × criticality) × 100

   where outcome points come from what actually happened to the obligation,
   criticality comes from the compliance library's own risk_level, and the
   points are scaled by the quality of the evidence on file. Every weight
   lives in src/lib/scoring-config.ts, and every component is returned in the
   breakdown so the number is always explainable.

   Every aggregate can additionally be scoped to a single financial year
   (fy_start_year) — the dashboard's FY selector passes this through so
   "applicable obligations" reflects one year's filing calendar rather than
   every FY ever generated.
   =========================================================================== */
import { q } from './db';
import {
  OUTCOME_POINTS, DEDUCTIONS, EVIDENCE_NONE,
  criticalitySql, evidenceQualitySql, evidenceFactorSql,
} from './scoring-config';

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
  base: number;               // unweighted approved / total — kept for continuity
  overduePenalty: number;
  delayPenalty: number;
  score: number;              // the weighted compliance health score

  /* --- weighted engine detail (Phase A) --------------------------------- */
  /** Points actually earned, criticality-weighted. */
  earnedPoints: number;
  /** Points that were available to earn, criticality-weighted. */
  maxPoints: number;
  /** Mean quality (0–100) of the evidence on obligations that carry any. */
  evidenceQuality: number;
  /** Share of applicable obligations that are Critical or High risk. */
  criticalShare: number;
  /** Count of Critical-risk obligations currently overdue. */
  criticalOverdue: number;
};

type Agg = {
  entity_id: string;
  total: string; approved: string; submitted: string; under_review: string;
  query_raised: string; rejected: string; evidence_pending: string; not_started: string;
  overdue: string; filed_late: string; avg_delay: string | null;
  with_evidence: string; filed_total: string; filed_ontime: string;
  in_review_ct: string;
  w_points: string | null; w_max: string | null; avg_eq: string | null;
  critical_high: string; critical_overdue: string;
};

/* ---------------------------------------------------------------- SQL parts
   Assembled once from the configuration so the query and the documented
   weights can never drift apart. `o` is obligations, `c` is compliances. */

const CRIT = criticalitySql('c.risk_level');

/* Evidence is summarised once per obligation in a LATERAL join rather than
   re-queried inside each aggregate. The same figures are needed by the points
   expression, the coverage count and the quality average; as correlated
   subqueries that was three scans of `evidence` per row, on a query that runs
   four times per dashboard load. */
const EVIDENCE_LATERAL = `
    LEFT JOIN LATERAL (
      SELECT max(${evidenceQualitySql('ev.doc_type', 'ev.file_name', 'ev.is_nil')}) AS quality,
             count(*) AS docs
        FROM evidence ev
       WHERE ev.obligation_id = o.id AND ev.deleted_at IS NULL
    ) evx ON TRUE`;

/** Best-quality document on the obligation, 0 when there is none. */
const EQ = `COALESCE(evx.quality, ${EVIDENCE_NONE.toFixed(2)})`;
const HAS_EVIDENCE = `(evx.docs > 0)`;

/** The same compliance was already filed late for this entity in an earlier
    period — a pattern rather than a one-off slip. */
const REPEATED_DELAY = `EXISTS (
      SELECT 1 FROM obligations o2
       WHERE o2.compliance_id = o.compliance_id
         AND o2.entity_id     = o.entity_id
         AND o2.id           <> o.id
         AND o2.deleted_at IS NULL
         AND o2.filed_date IS NOT NULL
         AND o2.filed_date  > o2.due_date
         AND o2.due_date    < o.due_date)`;

const IS_OVERDUE = `(o.filed_date IS NULL AND o.due_date < CURRENT_DATE AND o.status <> 'Approved')`;

/* A1 — what happened to this obligation, out of 100. */
const BASE_POINTS = `CASE
      WHEN o.status = 'Approved' AND (o.filed_date IS NULL OR o.filed_date <= o.due_date)
                                              THEN ${OUTCOME_POINTS.approvedOnTime}
      WHEN o.status = 'Approved'              THEN ${OUTCOME_POINTS.approvedLate}
      WHEN o.status IN ('Submitted','Under Review') THEN ${OUTCOME_POINTS.awaitingReview}
      WHEN o.status = 'Query Raised'          THEN ${OUTCOME_POINTS.queryRaised}
      WHEN o.status = 'Rejected'              THEN ${OUTCOME_POINTS.rejected}
      ELSE ${OUTCOME_POINTS.notStarted} END`;

const ADJUSTMENTS = `(
      CASE WHEN o.delay_days > 0 AND ${REPEATED_DELAY} THEN ${DEDUCTIONS.repeatedDelay} ELSE 0 END
    + CASE WHEN c.risk_level = 'Critical' AND ${IS_OVERDUE} THEN ${DEDUCTIONS.criticalOverdue} ELSE 0 END
    + CASE WHEN o.due_date < CURRENT_DATE AND o.status <> 'Approved' AND NOT ${HAS_EVIDENCE}
             THEN ${DEDUCTIONS.missingEvidence} ELSE 0 END)`;

/* A3 — evidence quality scales what the outcome earned. */
const POINTS = `GREATEST(0, LEAST(100, ${BASE_POINTS} + ${ADJUSTMENTS})) * ${evidenceFactorSql(EQ)}`;

/** Builds the `entity_id = ANY(...)` / `fy_start_year = ...` filter shared by
    every aggregate below, with placeholder numbers that always match the
    values array — so callers never have to track $1/$2 by hand. */
function scopeFilter(entityIds?: string[], fy?: number): { sql: string; vals: unknown[] } {
  const vals: unknown[] = [];
  const parts: string[] = [];
  if (entityIds && entityIds.length) { vals.push(entityIds); parts.push(`AND o.entity_id = ANY($${vals.length})`); }
  if (fy != null) { vals.push(fy); parts.push(`AND o.fy_start_year = $${vals.length}`); }
  return { sql: parts.join(' '), vals };
}

/* One builder for every grouping. The entity, country and category aggregates
   were three near-identical 30-line queries; they differ only in what they
   group by and which table that column comes from, so that is all they now
   state. Only counts obligations actually due by today — a period that has
   not come up yet cannot be filed, so it should not count against the score
   (or appear as "applicable") until its due date arrives. */
type Grouping = { select: string; join: string; groupBy: string };

const GROUPINGS = {
  none:     { select: `'' AS entity_id`,             join: '', groupBy: '' },
  entity:   { select: `o.entity_id`,                 join: '', groupBy: 'GROUP BY o.entity_id' },
  country:  { select: `e.country_code AS entity_id`, join: 'JOIN entities e ON e.id = o.entity_id', groupBy: 'GROUP BY e.country_code' },
  category: { select: `cat.name AS entity_id`,       join: 'JOIN categories cat ON cat.id = c.category_id', groupBy: 'GROUP BY cat.name' },
} satisfies Record<string, Grouping>;

function aggSql(g: Grouping, extraWhere = ''): string {
  return `
  SELECT ${g.select},
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
         count(*) FILTER (WHERE ${HAS_EVIDENCE})                          AS with_evidence,
         count(*) FILTER (WHERE o.filed_date IS NOT NULL)                 AS filed_total,
         count(*) FILTER (WHERE o.filed_date IS NOT NULL
                            AND o.filed_date <= o.due_date)               AS filed_ontime,
         -- weighted engine
         sum(${POINTS} * ${CRIT})                                         AS w_points,
         sum(100.0 * ${CRIT})                                             AS w_max,
         avg(${EQ}) FILTER (WHERE ${HAS_EVIDENCE})                        AS avg_eq,
         count(*) FILTER (WHERE c.risk_level IN ('Critical','High'))      AS critical_high,
         count(*) FILTER (WHERE c.risk_level = 'Critical' AND ${IS_OVERDUE}) AS critical_overdue
    FROM obligations o
    JOIN compliances c ON c.id = o.compliance_id
    ${EVIDENCE_LATERAL}
    ${g.join}
   WHERE o.deleted_at IS NULL
     AND o.status <> 'Not Applicable'
     AND o.due_date <= CURRENT_DATE
     ${extraWhere}
   ${g.groupBy}`;
}

function n(v: string | null): number { return Number(v ?? 0); }
function r1(v: number): number { return Math.round(v * 10) / 10; }

function build(a: Agg): ScoreBreakdown {
  const total = n(a.total);
  const approved = n(a.approved);
  const overdue = n(a.overdue);
  const filedTotal = n(a.filed_total);
  const avgDelay = a.avg_delay ? Number(a.avg_delay) : 0;

  const earned = n(a.w_points);
  const max = n(a.w_max);

  /* The weighted score. Outcome, criticality and evidence quality are all
     already priced into the points, so the old flat overdue/delay penalties
     are deliberately NOT subtracted again — doing so would charge for the
     same lateness twice. They remain in the breakdown because reports and
     the methodology page still report them as standalone indicators. */
  const score = max > 0 ? Math.max(0, Math.min(100, (earned / max) * 100)) : 0;

  const base = total ? (approved / total) * 100 : 0;
  const overduePenalty = total ? Math.min(15, (overdue / total) * 100 * 0.5) : 0;
  const delayPenalty = Math.min(5, avgDelay / 6);

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
    avgDelayDays: r1(avgDelay),
    evidenceCoverage: total ? r1((n(a.with_evidence) / total) * 100) : 0,
    onTimeRate: filedTotal ? r1((n(a.filed_ontime) / filedTotal) * 100) : 0,
    base: r1(base),
    overduePenalty: r1(overduePenalty),
    delayPenalty: r1(delayPenalty),
    score: r1(score),

    earnedPoints: Math.round(earned),
    maxPoints: Math.round(max),
    evidenceQuality: a.avg_eq ? r1(Number(a.avg_eq) * 100) : 0,
    criticalShare: total ? r1((n(a.critical_high) / total) * 100) : 0,
    criticalOverdue: n(a.critical_overdue),
  };
}

const EMPTY_AGG: Agg = {
  entity_id: '', total: '0', approved: '0', submitted: '0', under_review: '0',
  query_raised: '0', rejected: '0', evidence_pending: '0', not_started: '0',
  overdue: '0', filed_late: '0', avg_delay: null, with_evidence: '0',
  filed_total: '0', filed_ontime: '0', in_review_ct: '0',
  w_points: '0', w_max: '0', avg_eq: null, critical_high: '0', critical_overdue: '0',
};

async function grouped(g: Grouping, entityIds?: string[], fy?: number): Promise<Record<string, ScoreBreakdown>> {
  const { sql, vals } = scopeFilter(entityIds, fy);
  const rows = await q<Agg>(aggSql(g, sql), vals);
  const out: Record<string, ScoreBreakdown> = {};
  rows.forEach(row => { out[row.entity_id] = build(row); });
  return out;
}

export async function entityScores(entityIds?: string[], fy?: number): Promise<Record<string, ScoreBreakdown>> {
  return grouped(GROUPINGS.entity, entityIds, fy);
}

/** The same breakdown grouped by country — lets the dashboard's country
    filter re-scope the headline score exactly, with no client-side guesswork. */
export async function countryScores(entityIds?: string[], fy?: number): Promise<Record<string, ScoreBreakdown>> {
  return grouped(GROUPINGS.country, entityIds, fy);
}

/** Grouped by compliance category, for the dashboard's category tabs. */
export async function categoryScores(entityIds?: string[], fy?: number): Promise<Record<string, ScoreBreakdown>> {
  return grouped(GROUPINGS.category, entityIds, fy);
}

export async function overallScore(entityIds?: string[], fy?: number): Promise<ScoreBreakdown> {
  const { sql, vals } = scopeFilter(entityIds, fy);
  const rows = await q<Agg>(aggSql(GROUPINGS.none, sql), vals);
  return build(rows.length ? rows[0] : EMPTY_AGG);
}

export type CountryRow = {
  countryCode: string;
  countryName: string;
  entities: number;
  total: number;
  approved: number;
  overdue: number;
  score: number;
  /** A13 — position in the group league table, 1 = strongest. */
  rank: number;
};

/** Country-wise applicable vs followed, ranked. Scores come from
    countryScores(), which runs the same build() as every entity and overall
    score — country, entity and group figures must always foot to the same
    numbers when scoped the same way. */
export async function countryBreakdown(
  entityIds?: string[], fy?: number, precomputed?: Record<string, ScoreBreakdown>,
): Promise<CountryRow[]> {
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
    /* The caller usually needs the country scores in their own right as well,
       and this is a full weighted aggregate over every obligation in scope.
       Accepting them precomputed stops the dashboard paying for the same scan
       twice on every load. */
    precomputed ?? countryScores(entityIds, fy),
  ]);

  const rows = names.map(row => {
    const s = scores[row.country_code] ?? null;
    return {
      countryCode: row.country_code,
      countryName: row.country_name,
      entities: Number(row.entities),
      total: s?.total ?? 0, approved: s?.approved ?? 0, overdue: s?.overdue ?? 0,
      score: s?.score ?? 0,
      rank: 0,
    };
  });

  /* Ranked strongest first, then written back onto the alphabetical list so
     callers keep a stable order and gain the position. */
  [...rows].sort((a, b) => b.score - a.score).forEach((row, i) => { row.rank = i + 1; });
  return rows;
}

export type TrendPoint = { label: string; monthEnd: string; score: number; total: number; approved: number; overdue: number };

/** The score "as of" a past date, reconstructed from the real timestamps on
    each obligation and its evidence rather than a daily snapshot job — an
    obligation counts as approved as of that date only if a reviewer had
    already approved its evidence by then, and as overdue only if it was still
    unfiled by then. This lets the dashboard show a genuine month-on-month
    trend from day one, with no history-gathering period required.

    Deliberately still the simple ratio: reconstructing criticality-weighted
    points at an arbitrary past date would need the evidence rows as they
    stood that day, which is not recoverable. The trend therefore shows the
    shape of movement, and the headline score shows today's weighted position. */
export async function monthlyTrend(entityIds?: string[], months = 6): Promise<TrendPoint[]> {
  const now = new Date();
  const monthEnds: Date[] = [];
  for (let i = months - 1; i >= 0; i--) {
    monthEnds.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0)));
  }
  const isoEnds = monthEnds.map(d => d.toISOString().slice(0, 10));

  /* Every month in one pass. This ran a separate full aggregate per month —
     six scans of the register, plus their round trips, on every dashboard
     load — when the only thing that differed between them was the date being
     compared against. Unnesting the month ends and grouping by them gives the
     planner one scan to work with instead. */
  const vals: unknown[] = [isoEnds];
  let scopeSql = '';
  if (entityIds && entityIds.length) { vals.push(entityIds); scopeSql = `AND o.entity_id = ANY($${vals.length})`; }

  const rows = await q<{
    as_of: string; total: string; approved: string; overdue: string; filed_late: string;
    avg_delay: string | null; with_evidence: string; filed_total: string; filed_ontime: string;
  }>(`
    WITH month_ends AS (SELECT unnest($1::date[]) AS as_of)
    SELECT m.as_of::text AS as_of,
           count(*) AS total,
           count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM evidence e WHERE e.obligation_id = o.id AND e.deleted_at IS NULL
                AND e.status = 'Approved' AND e.reviewed_at <= m.as_of)) AS approved,
           count(*) FILTER (WHERE o.due_date < m.as_of
                              AND (o.filed_date IS NULL OR o.filed_date > m.as_of)
                              AND NOT EXISTS (
                                SELECT 1 FROM evidence e2 WHERE e2.obligation_id = o.id AND e2.deleted_at IS NULL
                                  AND e2.status = 'Approved' AND e2.reviewed_at <= m.as_of)) AS overdue,
           count(*) FILTER (WHERE o.filed_date IS NOT NULL AND o.filed_date <= m.as_of
                              AND o.filed_date > o.due_date) AS filed_late,
           avg(NULLIF(o.delay_days, 0)) FILTER (WHERE o.delay_days > 0
                              AND o.filed_date IS NOT NULL AND o.filed_date <= m.as_of) AS avg_delay,
           count(*) FILTER (WHERE EXISTS (
              SELECT 1 FROM evidence e3 WHERE e3.obligation_id = o.id AND e3.deleted_at IS NULL
                AND e3.uploaded_at <= m.as_of)) AS with_evidence,
           count(*) FILTER (WHERE o.filed_date IS NOT NULL AND o.filed_date <= m.as_of) AS filed_total,
           count(*) FILTER (WHERE o.filed_date IS NOT NULL AND o.filed_date <= m.as_of
                              AND o.filed_date <= o.due_date) AS filed_ontime
      FROM month_ends m
      JOIN obligations o
        ON o.deleted_at IS NULL AND o.status <> 'Not Applicable' AND o.due_date <= m.as_of
     WHERE TRUE ${scopeSql}
     GROUP BY m.as_of`, vals);

  const byDate = new Map(rows.map(r => [r.as_of.slice(0, 10), r]));

  return monthEnds.map((d, i) => {
    const iso = isoEnds[i];
    const row = byDate.get(iso);
    /* A month before the register begins has no rows at all — the inner join
       drops it, so it scores zero rather than disappearing from the series. */
    const s = row
      ? build({
          ...EMPTY_AGG,
          total: row.total, approved: row.approved, overdue: row.overdue,
          filed_late: row.filed_late, avg_delay: row.avg_delay,
          with_evidence: row.with_evidence, filed_total: row.filed_total,
          filed_ontime: row.filed_ontime,
          /* Historic points use the ratio directly: everything approved as at
             that date scored, everything else did not. */
          w_points: String(Number(row.approved ?? 0) * 100),
          w_max: String(Number(row.total ?? 0) * 100),
        })
      : build(EMPTY_AGG);
    return {
      label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      monthEnd: iso,
      score: s.score, total: s.total, approved: s.approved, overdue: s.overdue,
    };
  });
}

export function scoreBand(score: number): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (score >= 90) return { label: 'Strong', tone: 'good' };
  if (score >= 75) return { label: 'Acceptable', tone: 'warn' };
  return { label: 'Needs attention', tone: 'bad' };
}
