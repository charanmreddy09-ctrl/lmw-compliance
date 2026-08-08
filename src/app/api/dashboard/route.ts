/* One request powers the whole dashboard, so there is no waterfall of loaders. */
import { handler, ok, auth, entityFilter } from '@/lib/api';
import { q } from '@/lib/db';
import { overallScore, entityScores, countryBreakdown, countryScores, categoryScores, monthlyTrend } from '@/lib/score';
import { fyLabel, fyStartYearOf, today } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/** `entity_id = ANY(...)` / `fy_start_year = ...`, with placeholder numbers
    that always match the values array — shared by every raw query below so
    the entity scope and FY filter compose without hand-tracking $1/$2. */
function buildScope(scope: string[] | null, fy: number | null): { sql: string; vals: unknown[] } {
  const vals: unknown[] = [];
  const parts: string[] = [];
  if (scope) { vals.push(scope); parts.push(`AND o.entity_id = ANY($${vals.length})`); }
  if (fy != null) { vals.push(fy); parts.push(`AND o.fy_start_year = $${vals.length}`); }
  return { sql: parts.join(' '), vals };
}

export const GET = handler(async (req: Request) => {
  const u = await auth();
  const scope = entityFilter(u);
  const ids = scope ?? undefined;

  /* Defaults to the current financial year, but a CFO can pick another one
     from the dropdown — comparing years is a legitimate dashboard question,
     not something that belongs only in Reports. */
  const fyParam = new URL(req.url).searchParams.get('fy');
  const fyRequested = fyParam ? parseInt(fyParam, 10) : null;
  const fy = fyRequested != null && !Number.isNaN(fyRequested) ? fyRequested : fyStartYearOf(today());
  const { sql: scopeSql, vals: scopeVals } = buildScope(scope, fy);

  /* The country scores are needed twice: on their own, and as the basis of
     the country league table. Started once and shared, so the weighted
     aggregate over every obligation in scope runs a single time — while
     still resolving alongside everything else rather than ahead of it. */
  const countryScoresOnce = countryScores(ids, fy);

  const [overall, byEntity, byCountry, byCountryScore, byCategoryScore, fyRows, trend] = await Promise.all([
    overallScore(ids, fy), entityScores(ids, fy),
    countryScoresOnce.then(s => countryBreakdown(ids, fy, undefined, undefined, s)),
    countryScoresOnce, categoryScores(ids, fy),
    q<{ fy_start_year: number }>(`
      SELECT DISTINCT o.fy_start_year FROM obligations o
       WHERE o.deleted_at IS NULL ${scope ? 'AND o.entity_id = ANY($1)' : ''}
       ORDER BY o.fy_start_year DESC`, scope ? [scope] : []),
    /* The trend is one sparkline on a page carrying the group's whole
       compliance position. It is the only block here that is illustrative
       rather than operational, so it is not allowed to take the dashboard
       down with it — a missing chart is recoverable, a dead dashboard in
       front of the board is not. */
    monthlyTrend(ids, 6).catch(() => [] as Awaited<ReturnType<typeof monthlyTrend>>),
  ]);
  const availableFys = fyRows.map(r => ({ startYear: r.fy_start_year, label: fyLabel(r.fy_start_year) }));

  /* Obligations not yet due — excluded from the score (a period that hasn't
     come up yet can't be filed), but worth surfacing as an FYI line so the
     CFO can see what's coming without it dragging the score down. Scoped to
     the same FY as everything else: "future" means "later in this FY". */
  const futureRows = await q<{ country_code: string; n: string }>(`
    SELECT e.country_code, count(*) AS n
      FROM obligations o
      JOIN entities e ON e.id = o.entity_id
     WHERE o.deleted_at IS NULL AND o.status <> 'Not Applicable' AND o.due_date > CURRENT_DATE
       ${scopeSql}
     GROUP BY e.country_code`, scopeVals);
  const futureByCountry: Record<string, number> = {};
  let futureOverall = 0;
  futureRows.forEach(r => { futureByCountry[r.country_code] = Number(r.n); futureOverall += Number(r.n); });

  const entities = await q(`
    SELECT e.id, e.name, e.short_name, e.country_code, c.name AS country_name,
           e.entity_type, e.division_id, d.name AS division_name, e.city, e.employees
      FROM entities e
      JOIN countries c ON c.code = e.country_code
      LEFT JOIN divisions d ON d.id = e.division_id
     WHERE e.deleted_at IS NULL AND e.is_active
       ${scope ? 'AND e.id = ANY($1)' : ''}
     ORDER BY c.name, e.name`, scope ? [scope] : []);

  const byDivision = await q(`
    SELECT COALESCE(d.name,'Unassigned') AS division,
           count(*) AS total,
           count(*) FILTER (WHERE o.status = 'Approved') AS approved,
           count(*) FILTER (WHERE o.status <> 'Approved' AND o.filed_date IS NULL
                              AND o.due_date < CURRENT_DATE) AS overdue
      FROM obligations o
      JOIN entities e ON e.id = o.entity_id
      LEFT JOIN divisions d ON d.id = e.division_id
     WHERE o.deleted_at IS NULL AND o.status <> 'Not Applicable' AND o.due_date <= CURRENT_DATE
       ${scopeSql}
     GROUP BY d.name ORDER BY d.name`, scopeVals);

  const byCategory = await q(`
    SELECT cat.name AS category,
           count(*) AS total,
           count(*) FILTER (WHERE o.status = 'Approved') AS approved,
           count(*) FILTER (WHERE o.status <> 'Approved' AND o.filed_date IS NULL
                              AND o.due_date < CURRENT_DATE) AS overdue
      FROM obligations o
      JOIN compliances c ON c.id = o.compliance_id
      JOIN categories cat ON cat.id = c.category_id
     WHERE o.deleted_at IS NULL AND o.status <> 'Not Applicable' AND o.due_date <= CURRENT_DATE
       ${scopeSql}
     GROUP BY cat.name ORDER BY cat.name`, scopeVals);

  const heat = await q(`
    SELECT e.country_code, cat.name AS category,
           count(*) AS total, count(*) FILTER (WHERE o.status = 'Approved') AS approved,
           count(*) FILTER (WHERE o.status <> 'Approved' AND o.filed_date IS NULL
                              AND o.due_date < CURRENT_DATE) AS overdue
      FROM obligations o
      JOIN entities e ON e.id = o.entity_id
      JOIN compliances c ON c.id = o.compliance_id
      JOIN categories cat ON cat.id = c.category_id
     WHERE o.deleted_at IS NULL AND o.status <> 'Not Applicable' AND o.due_date <= CURRENT_DATE
       ${scopeSql}
     GROUP BY e.country_code, cat.name`, scopeVals);

  const upcoming = await q(`
    SELECT o.id, o.reference, o.due_date, o.status, o.period_label,
           c.title, c.risk_level, c.form_reference, e.short_name AS entity,
           e.country_code, u.full_name AS owner
      FROM obligations o
      JOIN compliances c ON c.id = o.compliance_id
      JOIN entities e ON e.id = o.entity_id
      LEFT JOIN users u ON u.id = o.assigned_to
     WHERE o.deleted_at IS NULL AND o.status NOT IN ('Approved','Not Applicable')
       AND o.due_date BETWEEN CURRENT_DATE - INTERVAL '45 days' AND CURRENT_DATE + INTERVAL '30 days'
       AND o.fy_start_year = $1
       ${scope ? 'AND o.entity_id = ANY($2)' : ''}
     ORDER BY o.due_date LIMIT 200`, scope ? [fy, scope] : [fy]);

  /* Deliberately NOT gated by due_date <= CURRENT_DATE, unlike the score
     aggregates above — a preparer who files ahead of the due date has still
     done real work that a reviewer needs to see, so it must count as
     "awaiting reviewer" even though it is excluded from the score itself
     (which only ever reflects obligations that have actually come due).
     Still scoped to the current FY, same as everything else on this page. */
  const pendingReviewRows = await q<{ country_code: string; n: string }>(`
    SELECT e.country_code, count(*) AS n
      FROM obligations o
      JOIN entities e ON e.id = o.entity_id
     WHERE o.deleted_at IS NULL AND o.status IN ('Submitted','Under Review') ${scopeSql}
     GROUP BY e.country_code`, scopeVals);
  const pendingReviewByCountry: Record<string, number> = {};
  let pendingReview = 0;
  pendingReviewRows.forEach(r => { pendingReviewByCountry[r.country_code] = Number(r.n); pendingReview += Number(r.n); });

  const activity = await q(`
    SELECT ra.id, ra.action, ra.comment, ra.created_at, ra.to_status,
           u.full_name AS actor, c.title, e.short_name AS entity
      FROM review_actions ra
      JOIN obligations o ON o.id = ra.obligation_id
      JOIN compliances c ON c.id = o.compliance_id
      JOIN entities e ON e.id = o.entity_id
      LEFT JOIN users u ON u.id = ra.actor_id
     WHERE 1=1 ${scope ? 'AND o.entity_id = ANY($1)' : ''}
     ORDER BY ra.created_at DESC LIMIT 18`, scope ? [scope] : []);

  const dueChanges = await q(`
    SELECT ddc.id, ddc.country_code, ddc.old_due_date, ddc.new_due_date, ddc.reason,
           ddc.changed_at, c.title, e.short_name AS entity
      FROM due_date_changes ddc
      LEFT JOIN compliances c ON c.id = ddc.compliance_id
      LEFT JOIN obligations o ON o.id = ddc.obligation_id
      LEFT JOIN compliances c2 ON c2.id = o.compliance_id
      LEFT JOIN entities e ON e.id = ddc.entity_id
     WHERE 1=1 ${scope ? 'AND (ddc.entity_id IS NULL OR ddc.entity_id = ANY($1))' : ''}
     ORDER BY ddc.changed_at DESC LIMIT 10`, scope ? [scope] : []);

  /* ------------------------------------------------------------ B1 / B2
     What moved yesterday, and what is exposed right now. Both feed panels
     that answer "what should I do today" rather than "what are the totals",
     so they are counted here in one round trip alongside everything else
     rather than becoming a second request from the client.

     Deliberately NOT gated by `due_date <= CURRENT_DATE` the way the score
     aggregates are: a brief about today has to be able to mention something
     falling due tomorrow. */
  const [movementRows, severityRows, tomorrowRows] = await Promise.all([
    /* Yesterday's workflow movements, by action. One grouped scan rather
       than four counting queries. */
    q<{ action: string; n: string }>(`
      SELECT ra.action, count(*) AS n
        FROM review_actions ra
        JOIN obligations o ON o.id = ra.obligation_id
       WHERE o.deleted_at IS NULL
         AND ra.created_at >= date_trunc('day', now()) - INTERVAL '1 day'
         AND ra.created_at <  date_trunc('day', now())
         ${scopeSql}
       GROUP BY ra.action`, scopeVals),

    /* Open exposure by how critical the law is — the "immediate attention"
       split. Open means due and not yet approved. */
    q<{ risk_level: string; n: string; overdue: string }>(`
      SELECT c.risk_level,
             count(*) AS n,
             count(*) FILTER (WHERE o.filed_date IS NULL AND o.due_date < CURRENT_DATE) AS overdue
        FROM obligations o
        JOIN compliances c ON c.id = o.compliance_id
       WHERE o.deleted_at IS NULL
         AND o.status NOT IN ('Approved','Not Applicable')
         AND o.due_date <= CURRENT_DATE
         ${scopeSql}
       GROUP BY c.risk_level`, scopeVals),

    q<{ id: string; title: string; entity: string; country_code: string; risk_level: string }>(`
      SELECT o.id, c.title, e.short_name AS entity, e.country_code, c.risk_level
        FROM obligations o
        JOIN compliances c ON c.id = o.compliance_id
        JOIN entities e ON e.id = o.entity_id
       WHERE o.deleted_at IS NULL
         AND o.status NOT IN ('Approved','Not Applicable')
         AND o.due_date = CURRENT_DATE + 1
         ${scopeSql}
       ORDER BY CASE c.risk_level WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END
       LIMIT 6`, scopeVals),
  ]);

  const movement: Record<string, number> = {};
  movementRows.forEach(r => { movement[r.action] = Number(r.n); });

  const severity = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  const severityOverdue = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  severityRows.forEach(r => {
    if (r.risk_level in severity) {
      severity[r.risk_level as keyof typeof severity] = Number(r.n);
      severityOverdue[r.risk_level as keyof typeof severityOverdue] = Number(r.overdue);
    }
  });

  /* Countries carrying open critical or high-risk exposure, weakest first —
     the "where do I look" line of the brief. */
  const countriesAtRisk = [...byCountry]
    .filter(c => c.overdue > 0 || c.score < 75)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
    .map(c => ({ code: c.countryCode, name: c.countryName, score: c.score, overdue: c.overdue }));

  const brief = {
    approved: movement.approve ?? 0,
    submitted: movement.submit ?? 0,
    queries: movement.query ?? 0,
    rejected: movement.reject ?? 0,
    escalated: movement.escalate ?? 0,
    severity,
    severityOverdue,
    dueTomorrow: tomorrowRows,
    countriesAtRisk,
  };

  return ok({
    overall, byEntity, byCountry, byCountryScore, byCategoryScore, entities, byDivision, byCategory, heat, trend,
    upcoming, activity, dueChanges, futureByCountry, futureOverall,
    availableFys, selectedFy: fy, fyLabel: fyLabel(fy),
    pendingReview, pendingReviewByCountry, brief,
    scopeLabel: scope ? `${entities.length} assigned entit${entities.length === 1 ? 'y' : 'ies'}` : 'All entities',
    syncedAt: new Date().toISOString(),
  });
});
