'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Ic, Gauge, Kpi, Note, Spinner, StatusPill, DataTable, Stat, Delta, Priority, HBar, scoreBand,
  scoreColor, fmtDate, fmtDateTime, daysFromToday, downloadFile, useToast,
} from '@/components/ui';
import type { SessionUser } from '@/lib/rbac';
import type { ScoreBreakdown, CountryRow } from '@/lib/score';

type EntityRow = {
  id: string; name: string; short_name: string; country_code: string; country_name: string;
  entity_type: string; division_name: string | null; city: string; employees: number;
};
type Upcoming = {
  id: string; reference: string; due_date: string; status: string; period_label: string;
  title: string; risk_level: string; form_reference: string | null; entity: string;
  country_code: string; owner: string | null;
};
type Activity = {
  id: number; action: string; comment: string | null; created_at: string;
  to_status: string | null; actor: string | null; title: string; entity: string;
};
type Grp = { division?: string; category?: string; total: string; approved: string; overdue: string };
type Heat = { country_code: string; category: string; total: string; approved: string; overdue: string };
type DueChange = {
  id: number; country_code: string; old_due_date: string; new_due_date: string;
  reason: string | null; changed_at: string; title: string | null; entity: string | null;
};
type TrendPoint = { label: string; monthEnd: string; score: number; total: number; approved: number; overdue: number };
type Payload = {
  overall: ScoreBreakdown;
  byEntity: Record<string, ScoreBreakdown>;
  byCountry: CountryRow[];
  byCountryScore: Record<string, ScoreBreakdown>;
  byCategoryScore: Record<string, ScoreBreakdown>;
  entities: EntityRow[];
  byDivision: Grp[];
  byCategory: Grp[];
  heat: Heat[];
  trend: TrendPoint[];
  upcoming: Upcoming[];
  activity: Activity[];
  dueChanges: DueChange[];
  pendingReview: number;
  pendingReviewByCountry: Record<string, number>;
  scopeLabel: string;
  futureByCountry: Record<string, number>;
  futureOverall: number;
  availableFys: { startYear: number; label: string }[];
  selectedFy: number | null;
  syncedAt: string;
};

const ZERO_SCORE: ScoreBreakdown = {
  total: 0, approved: 0, submitted: 0, underReview: 0, queryRaised: 0, rejected: 0,
  evidencePending: 0, notStarted: 0, overdue: 0, filedLate: 0, avgDelayDays: 0,
  evidenceCoverage: 0, onTimeRate: 0, base: 0, overduePenalty: 0, delayPenalty: 0, score: 0,
};

const ACTION_LABEL: Record<string, string> = {
  submit: 'submitted', approve: 'approved', reject: 'rejected', query: 'raised a query on',
  comment: 'commented on', reassign: 'reassigned', delegate: 'delegated',
  escalate: 'escalated', resubmit: 'resubmitted', reopen: 'reopened',
};
const ACTION_TONE: Record<string, string> = {
  approve: 'ok', reject: 'bad', query: 'warn', escalate: 'bad', submit: '', resubmit: '',
};

/* Every category in the library gets its own tab, mapped to the category
   names produced by db/library.ts (CATEGORIES) and returned by /api/dashboard. */
const CAT_TABS = [
  { id: 'overall', label: 'Overall', matchName: null, icon: 'globe' },
  { id: 'direct_tax', label: 'Direct Tax', matchName: 'Direct Tax', icon: 'report' },
  { id: 'vat_gst', label: 'GST', matchName: 'VAT / GST', icon: 'sheet' },
  { id: 'corporate_law', label: 'Companies Act', matchName: 'Corporate Law', icon: 'building' },
  { id: 'labour_law', label: 'Labour Laws', matchName: 'Labour Law', icon: 'users' },
  { id: 'securities_sebi', label: 'Securities / SEBI', matchName: 'Securities / SEBI', icon: 'shield' },
  { id: 'foreign_exchange', label: 'Foreign Exchange', matchName: 'Foreign Exchange', icon: 'swap' },
  { id: 'customs_trade', label: 'Customs & Trade', matchName: 'Customs & Trade', icon: 'send' },
  { id: 'environmental_ehs', label: 'Environmental', matchName: 'Environmental (EHS)', icon: 'book' },
  { id: 'industry_regulation', label: 'Industry Regulation', matchName: 'Industry Regulation', icon: 'gear' },
  { id: 'transfer_pricing', label: 'Transfer Pricing', matchName: 'Transfer Pricing', icon: 'dash' },
  { id: 'data_privacy', label: 'Data Privacy & Cyber', matchName: 'Data Privacy & Cyber', icon: 'eye' },
  { id: 'competition_law', label: 'Competition Law', matchName: 'Competition Law', icon: 'review' },
] as const;

/* The % glyph inherits the monospace tabular-nums number font from its
   parent (.num) if not overridden, which gives it an oversized advance
   width and reads as "floating away" from the digit it belongs to. Always
   render it in the ordinary sans font with a small fixed gap instead. */
function Pctu() {
  return <span style={{ fontSize: 13, fontFamily: 'var(--font-sans)', fontWeight: 400, marginLeft: 1 }}>%</span>;
}
export default function Dashboard() {
  const toast = useToast();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');
  const [countryFilter, setCountryFilter] = useState('');
  const [catTab, setCatTab] = useState<string>('overall');
  const [upcomingWindow, setUpcomingWindow] = useState<'day' | '15d' | 'month'>('month');
  const [fyFilter, setFyFilter] = useState<number | ''>('');

  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let live = true;
    async function load(showSpinnerOnFail: boolean) {
      setSyncing(true);
      try {
        const qs = fyFilter !== '' ? `?fy=${fyFilter}` : '';
        const [me, dash] = await Promise.all([
          fetch('/api/auth/me').then(r => r.json()),
          fetch(`/api/dashboard${qs}`).then(async r => {
            const j = await r.json();
            if (!r.ok) throw new Error(j.error ?? 'Unable to load the dashboard.');
            return j;
          }),
        ]);
        if (!live) return;
        setUser(me.user);
        setD(dash);
        setErr(null);
        /* First load with no FY chosen yet — default to the most recent
           financial year rather than showing every FY ever generated
           combined, which inflates "Applicable obligations" well past what
           a single year's filing calendar actually looks like. */
        if (fyFilter === '' && dash.availableFys?.length) {
          setFyFilter(dash.availableFys[0].startYear);
        }
      } catch (e) {
        if (live && showSpinnerOnFail) setErr(e instanceof Error ? e.message : 'Unable to load the dashboard.');
        /* a background refresh failing silently is better than yanking the
           screen out from under whatever the CFO is looking at */
      } finally {
        if (live) setSyncing(false);
      }
    }
    load(true);
    /* Auto-sync: a preparer's filing or a reviewer's decision shows up here
       without anyone needing to reload the page. */
    const t = setInterval(() => load(false), 60_000);
    return () => { live = false; clearInterval(t); };
  }, [fyFilter]);

  const isCfo = user?.role === 'CFO';

  if (err) return <Note kind="b">{err}</Note>;
  if (!d || !user) return <Spinner label="Building the compliance picture…" />;

  const o = countryFilter ? (d.byCountryScore[countryFilter] ?? d.overall) : d.overall;
  const futureCount = countryFilter ? (d.futureByCountry[countryFilter] ?? 0) : d.futureOverall;
  /* Not gated by due date, unlike o.submitted/o.underReview — a submission
     filed ahead of its due date is still real work waiting on a reviewer. */
  const awaitingReviewer = countryFilter ? (d.pendingReviewByCountry[countryFilter] ?? 0) : d.pendingReview;
  const worst = [...d.byCountry].sort((a, b) => a.score - b.score).slice(0, 3);
  const entityRanked = d.entities
    .map(e => ({ ...e, s: d.byEntity[e.id] }))
    .filter(e => e.s)
    .sort((a, b) => (a.s!.score - b.s!.score));

  const activeCat = CAT_TABS.find(t => t.id === catTab) ?? CAT_TABS[0];
  const catScore = activeCat.matchName === null ? o : (d.byCategoryScore[activeCat.matchName] || ZERO_SCORE);
  const catRows = d.heat.filter(h =>
    (activeCat.matchName === null || h.category === activeCat.matchName) &&
    (!countryFilter || h.country_code === countryFilter));
  const catTotals = catRows.reduce((acc, h) => ({
    total: acc.total + Number(h.total), approved: acc.approved + Number(h.approved),
    overdue: acc.overdue + Number(h.overdue),
  }), { total: 0, approved: 0, overdue: 0 });
  const catPct = catTotals.total ? Math.round((catTotals.approved / catTotals.total) * 1000) / 10 : 0;

  const WINDOW_DAYS: Record<typeof upcomingWindow, number> = { day: 1, '15d': 15, month: 30 };
  const upcomingShown = d.upcoming.filter(u => {
    const n = daysFromToday(u.due_date);
    return n != null && n <= WINDOW_DAYS[upcomingWindow];
  });

  /* --------------------------------------------------------- executive read
     Everything below is derived from the payload already on screen — no extra
     request, and every figure traces back to a number the score engine
     produced, so the tiles can never disagree with the table under them. */

  /* Destinations are role-aware. A preparer has no reports.generate and a CFO
     deliberately has no review queue, so the same tile points each of them at
     the screen where they can actually act. */
  const canReport = user.permissions.includes('reports.generate');
  const canReview = user.permissions.includes('compliance.review');
  const overdueHref = canReport ? '/reports?r=overdue' : '/register';
  const evidenceHref = canReport ? '/reports?r=evidence' : '/register';
  const reviewHref = canReview ? '/reviews' : isCfo ? '/reports?r=executive' : '/register';

  const trendDelta = d.trend.length >= 2
    ? d.trend[d.trend.length - 1].score - d.trend[d.trend.length - 2].score
    : 0;

  /* Critical and high-risk items already past due. Counted from the same
     45-day window the table below draws on, so the tile and the rows behind
     it can never tell different stories. */
  const criticalRisks = d.upcoming.filter(u => {
    const n = daysFromToday(u.due_date);
    return n != null && n < 0 && (u.risk_level === 'Critical' || u.risk_level === 'High');
  }).length;
  const dueThisWeek = d.upcoming.filter(u => {
    const n = daysFromToday(u.due_date);
    return n != null && n >= 0 && n <= 7;
  }).length;
  const openQueries = o.queryRaised + o.rejected;
  const band = scoreBand(o.score);

  /* One sentence explaining the score, chosen by what is actually true rather
     than a fixed template — the CFO's first question is always "why". */
  const insight =
    o.total === 0
      ? 'No obligations have fallen due in this scope yet, so there is nothing to score.'
    : o.overdue > 0 && o.overdue / o.total > 0.1
      ? `${o.overdue} of ${o.total} obligations are past due with no evidence — that is what is holding the score down.`
    : trendDelta > 0.05
      ? `Improved on last month: ${o.approved} obligations now carry reviewer-approved evidence.`
    : trendDelta < -0.05
      ? `Down on last month — ${o.overdue} overdue and ${awaitingReviewer} still sitting with reviewers.`
    : awaitingReviewer > 0
      ? `${awaitingReviewer} submission${awaitingReviewer === 1 ? '' : 's'} awaiting review; clearing them is what moves the score next.`
      : 'Stable. Evidence coverage and approvals are keeping pace with the filing calendar.';

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'overall', label: 'Overall by country' },
    { id: 'entities', label: 'Entity scores' },
    { id: 'trends', label: 'Trends & heat map' },
    { id: 'activity', label: 'Recent activity' },
  ];

  /* Country x category grid, coloured by % followed — the same d.heat rows
     already computed for the act tabs, just pivoted for a heat map instead
     of read one category at a time. */
  const heatRows = d.heat;
  const heatCategories = [...new Set(heatRows.map(h => h.category))].sort();
  const heatCountries = d.byCountry.map(c => ({ code: c.countryCode, name: c.countryName }));
  function heatCell(countryCode: string, category: string) {
    const h = heatRows.find(x => x.country_code === countryCode && x.category === category);
    if (!h || Number(h.total) === 0) return null;
    const total = Number(h.total), approved = Number(h.approved);
    return { pct: Math.round((approved / total) * 100), total, approved, overdue: Number(h.overdue) };
  }

  return (
    <>
      {/* --------------------------------------------------------- page chrome
          Scope controls sit above the content as page chrome rather than
          inside a card — they govern everything below, so they should not
          look like they belong to any one panel. */}
      <div className="page-bar no-print">
        <select value={fyFilter} onChange={e => setFyFilter(e.target.value ? Number(e.target.value) : '')}
                aria-label="Filter by financial year">
          {d.availableFys.map(f => <option key={f.startYear} value={f.startYear}>{f.label}</option>)}
        </select>
        <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
                aria-label="Filter by country">
          <option value="">All countries</option>
          {d.byCountry.map(c => <option key={c.countryCode} value={c.countryCode}>{c.countryName}</option>)}
        </select>
        <span className="grow" />
        <span className="tiny dim" title={new Date(d.syncedAt).toLocaleString()}>
          <Ic n="swap" s={12} c={syncing ? 'var(--navy-600)' : 'var(--ink-4)'} />
          {' '}Synced {new Date(d.syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        {canReport && (
          <button className="btn btn-s"
                  onClick={() => downloadFile('/api/reports/executive?format=xlsx', 'Executive summary.xlsx', toast)}>
            <Ic n="download" s={13} /> Executive summary
          </button>
        )}
      </div>

      {/* ------------------------------------------------------ executive row */}
      <div className="exec-grid mb16">
        <div className="card hero-card">
          <div className="hero-b">
            <Gauge value={o.score} />
            <div className="hero-fig grow">
              <div className="cap">Compliance health</div>
              <div className="row g12 wrap">
                <span className={`pill ${band.tone === 'ok' ? 'p-ok' : band.tone === 'warn' ? 'p-warn' : 'p-bad'}`}>
                  {band.label}
                </span>
                <Delta value={trendDelta} />
              </div>
              <div className="hero-note">{insight}</div>
              <div className="row g24 wrap mt8">
                <div>
                  <div className="tiny dim">Applicable</div>
                  <div className="num strong" style={{ fontSize: 17 }}>{o.total}</div>
                </div>
                <div>
                  <div className="tiny dim">Approved</div>
                  <div className="num strong" style={{ fontSize: 17, color: 'var(--ok-700)' }}>{o.approved}</div>
                </div>
                <div>
                  <div className="tiny dim">Not yet due</div>
                  <div className="num strong" style={{ fontSize: 17, color: 'var(--ink-3)' }}>{futureCount}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Stat label="Critical risks" value={criticalRisks} icon="alert" tone="bad"
              sub="Critical or high risk, past due" href={overdueHref} cta="View details" />
        <Stat label="Overdue" value={o.overdue} icon="clock" tone="warn"
              sub="Past due, no evidence filed" href={overdueHref} cta="View report" />
        <Stat label="Pending reviews" value={awaitingReviewer} icon="review" tone="info"
              sub={isCfo ? 'Across all reviewers' : 'Waiting on a decision'} href={reviewHref}
              cta={canReview ? 'Open queue' : 'View details'} />
        <Stat label="Evidence coverage" value={o.evidenceCoverage} unit="%" icon="shield"
              tone={o.evidenceCoverage >= 90 ? 'ok' : 'warn'}
              sub="Obligations with a document" href={evidenceHref} cta="View evidence" />
      </div>

      {o.overdue > 0 && (
        <div className="mb16">
          <Note kind={o.overdue > o.total * 0.1 ? 'b' : 'w'}>
            <strong>{o.overdue} obligation{o.overdue === 1 ? '' : 's'} past the due date with no evidence uploaded.</strong>{' '}
            {worst.length > 0 && (
              <>Weakest countries: {worst.map(w => `${w.countryName} (${w.score})`).join(', ')}. </>
            )}
            <Link href={overdueHref} className="strong">Open the overdue report</Link>
          </Note>
        </div>
      )}

      {/* -------------------------------------------------------- ACT TABS
          Always visible at the top, next to the headline score — not buried
          in a tab further down the page. */}
      <div className="card act-tabs mb16">
        <div className="act-tabs-h">
          {CAT_TABS.map(t => (
            <button key={t.id} className={`act-tab${catTab === t.id ? ' on' : ''}`} onClick={() => setCatTab(t.id)}>
              <Ic n={t.icon} s={15} /> {t.label}
            </button>
          ))}
          <span className="grow" />
          <span className="tiny muted no-print" style={{ padding: '0 14px' }}>
            {countryFilter ? d.byCountry.find(c => c.countryCode === countryFilter)?.countryName : 'All countries'}
          </span>
        </div>
        {/* One compact strip rather than a second scorecard — the category
            view answers "how is this act doing", not "what is the group
            score", which the hero above already owns. */}
        <div className="card-b">
          {catTotals.total === 0 ? (
            <div className="small muted">No applicable obligations in this category for the current filter.</div>
          ) : (
            <div className="row g24 wrap">
              <div>
                <div className="tiny dim">Followed</div>
                <div className="num strong" style={{ fontSize: 26, lineHeight: 1.1, color: scoreColor(catPct) }}>
                  {catPct}<span style={{ fontSize: 14, fontFamily: 'var(--font-sans)', marginLeft: 1 }}>%</span>
                </div>
              </div>
              <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--line-2)' }} />
              {([
                ['Applicable', catTotals.total, undefined],
                ['Approved', catTotals.approved, 'var(--ok-700)'],
                ['Overdue', catTotals.overdue, catTotals.overdue ? 'var(--bad-600)' : undefined],
                ['Evidence coverage', `${catScore.evidenceCoverage}%`, undefined],
                ['On-time filing', `${catScore.onTimeRate}%`, undefined],
                ['Average delay', `${catScore.avgDelayDays} d`, catScore.avgDelayDays > 0 ? 'var(--warn-700)' : undefined],
              ] as const).map(([label, value, colour]) => (
                <div key={label}>
                  <div className="tiny dim">{label}</div>
                  <div className="num strong" style={{ fontSize: 17, color: colour }}>{value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="tabs no-print">
        {TABS.map(t => (
          <button key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------ OVERVIEW */}
      {tab === 'overview' && (
        <>
          <div className="grid g-side-r mb16">
            {/* ------------------------------------------- today's priorities
                The action list. Four rows, each a count plus the one thing to
                do about it, each opening the screen where it gets done. */}
            <div className="card">
              <div className="card-h">
                <h3>Today&apos;s priorities</h3>
                <span className="tiny dim">{d.scopeLabel}</span>
              </div>
              <div className="prio">
                <Priority count={o.overdue} icon="alert" tone={o.overdue ? 'bad' : 'ok'}
                          title={o.overdue ? 'Overdue filings' : 'Nothing overdue'}
                          sub={o.overdue ? 'Past due with no evidence — act first' : 'Every due obligation has evidence'}
                          href={overdueHref} />
                <Priority count={dueThisWeek} icon="cal" tone={dueThisWeek ? 'warn' : 'ok'}
                          title="Due this week"
                          sub={dueThisWeek ? 'Falling due in the next 7 days' : 'Nothing falls due in the next 7 days'}
                          href="/calendar" />
                <Priority count={awaitingReviewer} icon="review" tone={awaitingReviewer ? 'info' : 'ok'}
                          title={canReview ? 'Awaiting your approval' : 'Awaiting approval'}
                          sub={awaitingReviewer ? 'Submitted with evidence, not yet decided' : 'No submissions waiting'}
                          href={reviewHref} />
                <Priority count={openQueries} icon="flag" tone={openQueries ? 'warn' : 'ok'}
                          title={openQueries ? 'Queries and rejections' : 'No outstanding queries'}
                          sub={openQueries ? 'Returned to the preparer for correction' : 'Nothing sitting with preparers'}
                          href={canReview ? '/reviews' : '/register'} />
              </div>
            </div>

            {/* --------------------------------------------- compliance due
                The heart of the screen. The row itself opens the obligation;
                the trailing control is a quiet view action rather than a
                primary button, so the table reads as a register and not as a
                column of calls to action. */}
            <div className="card">
              <div className="card-h">
                <div>
                  <h3>{isCfo ? 'Compliance due' : 'Your compliance due'}</h3>
                  <span className="tiny muted">{upcomingShown.length} obligation{upcomingShown.length === 1 ? '' : 's'} in this window</span>
                </div>
                <div className="seg no-print">
                  {([['day', 'Today'], ['15d', '15 days'], ['month', '30 days']] as const).map(([id, label]) => (
                    <button key={id} className={upcomingWindow === id ? 'on' : ''}
                            onClick={() => setUpcomingWindow(id)}>{label}</button>
                  ))}
                </div>
              </div>
              <DataTable<Upcoming & Record<string, unknown>>
                rows={upcomingShown as (Upcoming & Record<string, unknown>)[]}
                rowKey={r => r.id}
                pageSize={8}
                onRow={r => { window.location.href = `/register?obligation=${r.id}`; }}
                empty="Nothing falls due in this window."
                cols={[
                  { key: 'due_date', label: 'Due date', sort: true, cls: 'nowrap',
                    render: r => <span className="num">{fmtDate(r.due_date)}</span> },
                  { key: 'title', label: 'Compliance', sort: true, cls: 'w',
                    render: r => (<><div className="t1">{r.title}</div>
                      <div className="t2">{r.period_label}{r.form_reference ? ` · ${r.form_reference}` : ''}</div></>) },
                  { key: 'entity', label: 'Entity / country', sort: true, cls: 'nowrap',
                    render: r => (<><div className="t1" style={{ fontWeight: 500 }}>{r.entity}</div>
                      <div className="t2">{r.country_code}</div></>) },
                  /* The upcoming payload carries the assigned preparer, not a
                     reviewer — labelled for what it actually is rather than
                     borrowing a heading the data cannot support. */
                  { key: 'owner', label: 'Owner', sort: true, cls: 'nowrap small',
                    render: r => r.owner ?? <span className="dim">Unassigned</span> },
                  { key: 'status', label: 'Status', sort: true, render: r => <StatusPill s={r.status} /> },
                  { key: 'days', label: 'Days left', sort: true, cls: 'nowrap right',
                    value: r => daysFromToday(r.due_date) ?? 9999,
                    render: r => {
                      const n = daysFromToday(r.due_date);
                      if (n == null) return <span className="dim">—</span>;
                      const late = n < 0;
                      return (
                        <span className="num strong"
                              style={{ color: late ? 'var(--bad-600)' : n <= 3 ? 'var(--warn-700)' : 'var(--ink-3)' }}>
                          {late ? `−${-n}` : n === 0 ? 'Today' : n}
                        </span>
                      );
                    } },
                  { key: 'actions', label: '', cls: 'nowrap right no-print',
                    render: r => (
                      <Link href={`/register?obligation=${r.id}`} className="rowact"
                            aria-label={`Open ${r.title}`} title="Open this obligation"
                            onClick={e => e.stopPropagation()}>
                        <Ic n="eye" s={15} />
                      </Link>
                    ) },
                ]}
              />
            </div>
          </div>

          {/* ------------------------------------------------- supporting read
              Three panels, each answering one board-level question: which
              country needs attention, which way is the score moving, and what
              has just happened. Nothing here is decorative. */}
          <div className="grid g-3">
            <div className="card">
              <div className="card-h">
                <h3>Where attention is needed</h3>
                <button className="btn btn-xs no-print" onClick={() => setTab('overall')}>By country</button>
              </div>
              <div className="card-b">
                {d.byCountry.length === 0 && <div className="small muted">No country data in scope.</div>}
                {[...d.byCountry].sort((a, b) => a.score - b.score).slice(0, 6).map(c => (
                  <HBar key={c.countryCode} label={c.countryName} value={c.score}
                        sub={`${c.approved} of ${c.total} followed`} />
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-h">
                <h3>Score trend</h3>
                <span className="tiny dim">Last 6 months</span>
              </div>
              <div className="card-b">
                {(() => {
                  const w = 320, h = 122, padX = 12, padY = 20;
                  const pts = d.trend;
                  if (pts.length < 2) return <div className="small muted">Not enough history yet.</div>;
                  const x = (i: number) => padX + (i / (pts.length - 1)) * (w - padX * 2);
                  const y = (v: number) => h - padY - (v / 100) * (h - padY * 2);
                  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.score)}`).join(' ');
                  const area = `${line} L ${x(pts.length - 1)} ${h - padY} L ${x(0)} ${h - padY} Z`;
                  return (
                    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 132 }} role="img"
                         aria-label={`Compliance score over the last ${pts.length} months`}>
                      {[0, 50, 100].map(g => (
                        <line key={g} x1={padX} x2={w - padX} y1={y(g)} y2={y(g)} stroke="var(--line-2)" strokeWidth={1} />
                      ))}
                      <path d={area} fill="var(--navy-050)" />
                      <path d={line} fill="none" stroke="var(--navy-600)" strokeWidth={2}
                            strokeLinejoin="round" strokeLinecap="round" />
                      {pts.map((p, i) => (
                        <circle key={p.monthEnd} cx={x(i)} cy={y(p.score)} r={i === pts.length - 1 ? 4 : 2.5}
                                fill={i === pts.length - 1 ? scoreColor(p.score) : 'var(--navy-600)'} />
                      ))}
                      {pts.map((p, i) => (
                        <text key={p.monthEnd} x={x(i)} y={h - 5} textAnchor="middle" fontSize={9.5}
                              fill="var(--ink-4)">{p.label}</text>
                      ))}
                    </svg>
                  );
                })()}
                <div className="row between mt8">
                  <span className="tiny dim">Current</span>
                  <span className="num strong" style={{ color: scoreColor(o.score) }}>{o.score.toFixed(1)}</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-h">
                <h3>Recent activity</h3>
                <button className="btn btn-xs no-print" onClick={() => setTab('activity')}>View all</button>
              </div>
              <div className="card-b">
                {d.activity.length === 0 && <div className="small muted">No activity recorded yet.</div>}
                <div className="tl">
                  {d.activity.slice(0, 5).map(a => (
                    <div className={`tl-i ${ACTION_TONE[a.action] ?? ''}`} key={a.id}>
                      <div className="tl-t">
                        <strong>{a.actor ?? 'System'}</strong> {ACTION_LABEL[a.action] ?? a.action}{' '}
                        {a.title}
                      </div>
                      <div className="tl-m mt4">{fmtDateTime(a.created_at)} · {a.entity}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ---------------------------------------------- OVERALL BY COUNTRY (CFO) */}
      {tab === 'overall' && (
        <>
          <Note kind="i">
            Country-specific compliances that apply to the entities in that country, and how
            many of them are actually followed — evidenced and approved. This is the
            group-level answer that used to come from a representation letter.
          </Note>

          <div className="grid g-4 mt16 mb16">
            {d.byCountry.slice(0, 4).map(c => (
              <Kpi key={c.countryCode} label={c.countryName}
                   value={c.score.toFixed(1)}
                   sub={`${c.approved} of ${c.total} followed`} bar={c.score} />
            ))}
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Applicable versus followed, by country</h3>
              <button className="btn btn-s no-print"
                      onClick={() => downloadFile('/api/reports/country?format=xlsx', 'country.xlsx', toast)}>
                <Ic n="download" s={13} /> Export
              </button>
            </div>
            <div className="tw">
              <table className="dt">
                <thead>
                  <tr>
                    <th>Country</th><th className="right">Entities</th>
                    <th className="right">Applicable</th><th className="right">Followed</th>
                    <th className="right">Not followed</th><th className="right">Overdue</th>
                    <th style={{ width: 170 }}>Compliance score</th>
                  </tr>
                </thead>
                <tbody>
                  {d.byCountry.map(c => (
                    <tr key={c.countryCode}>
                      <td><div className="t1">{c.countryName}</div><div className="t2">{c.countryCode}</div></td>
                      <td className="right num">{c.entities}</td>
                      <td className="right num">{c.total}</td>
                      <td className="right num" style={{ color: 'var(--ok-700)' }}>{c.approved}</td>
                      <td className="right num">{c.total - c.approved}</td>
                      <td className="right num" style={{ color: c.overdue ? 'var(--bad-600)' : undefined }}>{c.overdue}</td>
                      <td>
                        <div className="row g8">
                          <span className="num strong" style={{ color: scoreColor(c.score), minWidth: 38 }}>
                            {c.score.toFixed(1)}
                          </span>
                          <span className="bar grow" style={{ marginTop: 0 }}>
                            <i style={{ width: `${c.score}%`, background: scoreColor(c.score) }} />
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <td className="strong">Group total</td>
                    <td className="right num strong">{d.entities.length}</td>
                    <td className="right num strong">{o.total}</td>
                    <td className="right num strong">{o.approved}</td>
                    <td className="right num strong">{o.total - o.approved}</td>
                    <td className="right num strong">{o.overdue}</td>
                    <td>
                      <span className="num strong" style={{ color: scoreColor(o.score) }}>{o.score.toFixed(1)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid g-2 mt16">
            <div className="card">
              <div className="card-h"><h3>By division</h3></div>
              <div className="tw">
                <table className="dt">
                  <thead><tr><th>Division</th><th className="right">Applicable</th>
                    <th className="right">Followed</th><th className="right">Overdue</th><th className="right">%</th></tr></thead>
                  <tbody>
                    {d.byDivision.map(r => {
                      const t = Number(r.total), a = Number(r.approved);
                      const pct = t ? Math.round((a / t) * 1000) / 10 : 0;
                      return (
                        <tr key={r.division}>
                          <td className="t1">{r.division}</td>
                          <td className="right num">{t}</td>
                          <td className="right num">{a}</td>
                          <td className="right num">{r.overdue}</td>
                          <td className="right num strong" style={{ color: scoreColor(pct) }}>{pct}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card">
              <div className="card-h"><h3>By category</h3></div>
              <div className="tw">
                <table className="dt">
                  <thead><tr><th>Category</th><th className="right">Applicable</th>
                    <th className="right">Followed</th><th className="right">Overdue</th><th className="right">%</th></tr></thead>
                  <tbody>
                    {d.byCategory.map(r => {
                      const t = Number(r.total), a = Number(r.approved);
                      const pct = t ? Math.round((a / t) * 1000) / 10 : 0;
                      return (
                        <tr key={r.category}>
                          <td className="t1">{r.category}</td>
                          <td className="right num">{t}</td>
                          <td className="right num">{a}</td>
                          <td className="right num">{r.overdue}</td>
                          <td className="right num strong" style={{ color: scoreColor(pct) }}>{pct}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ------------------------------------------------------- ENTITY SCORES */}
      {tab === 'entities' && (
        <div className="card">
          <div className="card-h">
            <h3>Entity scorecards</h3>
            <button className="btn btn-s no-print"
                    onClick={() => downloadFile('/api/reports/entity?format=xlsx', 'entity.xlsx', toast)}>
              <Ic n="download" s={13} /> Export
            </button>
          </div>
          <div className="tw">
            <table className="dt">
              <thead>
                <tr>
                  <th>Entity</th><th>Country</th><th>Division</th>
                  <th className="right">Applicable</th><th className="right">Approved</th>
                  <th className="right">In review</th><th className="right">Overdue</th>
                  <th className="right">Coverage</th><th style={{ width: 160 }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {entityRanked.map(e => {
                  const s = e.s!;
                  return (
                    <tr key={e.id} className="click"
                        onClick={() => { window.location.href = `/entities/${e.id}`; }}>
                      <td><div className="t1">{e.short_name}</div><div className="t2">{e.name}</div></td>
                      <td className="nowrap">{e.country_name}</td>
                      <td className="small">{e.division_name ?? '—'}</td>
                      <td className="right num">{s.total}</td>
                      <td className="right num">{s.approved}</td>
                      <td className="right num">{s.submitted + s.underReview}</td>
                      <td className="right num" style={{ color: s.overdue ? 'var(--bad-600)' : undefined }}>{s.overdue}</td>
                      <td className="right num">{s.evidenceCoverage}<Pctu /></td>
                      <td>
                        <div className="row g8">
                          <span className="num strong" style={{ color: scoreColor(s.score), minWidth: 36 }}>
                            {s.score.toFixed(1)}
                          </span>
                          <span className="bar grow" style={{ marginTop: 0 }}>
                            <i style={{ width: `${s.score}%`, background: scoreColor(s.score) }} />
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --------------------------------------------------- TRENDS & HEAT MAP */}
      {tab === 'trends' && (
        <>
          <div className="card mb16">
            <div className="card-h">
              <h3>Group compliance score — last 6 months</h3>
              <span className="tiny muted">Reconstructed from approval and filing dates, not a point-in-time reading</span>
            </div>
            <div className="card-b">
              {(() => {
                const w = 640, h = 140, pad = 28;
                const pts = d.trend;
                const max = 100, min = 0;
                const x = (i: number) => pad + (i / Math.max(1, pts.length - 1)) * (w - pad * 2);
                const y = (v: number) => h - pad - ((v - min) / (max - min)) * (h - pad * 2);
                const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.score)}`).join(' ');
                return (
                  <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 160 }}>
                    {[0, 25, 50, 75, 100].map(g => (
                      <line key={g} x1={pad} x2={w - pad} y1={y(g)} y2={y(g)}
                            stroke="var(--line-2)" strokeWidth={1} />
                    ))}
                    <path d={path} fill="none" stroke="var(--navy-600)" strokeWidth={2.5} />
                    {pts.map((p, i) => (
                      <g key={p.monthEnd}>
                        <circle cx={x(i)} cy={y(p.score)} r={4} fill={scoreColor(p.score)} />
                        <text x={x(i)} y={y(p.score) - 10} textAnchor="middle" fontSize={11} fontWeight={600}
                              fill="var(--ink-2)">{p.score}</text>
                        <text x={x(i)} y={h - 6} textAnchor="middle" fontSize={11} fill="var(--ink-4)">{p.label}</text>
                      </g>
                    ))}
                  </svg>
                );
              })()}
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Heat map — country × category</h3>
              <span className="tiny muted">% of applicable obligations followed, current FY scope</span>
            </div>
            <div className="tw">
              <table className="dt">
                <thead>
                  <tr>
                    <th>Country</th>
                    {heatCategories.map(c => <th key={c} className="center">{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {heatCountries.map(co => (
                    <tr key={co.code}>
                      <td className="t1 nowrap">{co.name}</td>
                      {heatCategories.map(cat => {
                        const cell = heatCell(co.code, cat);
                        return (
                          <td key={cat} className="center" style={{ padding: 4 }}>
                            {cell ? (
                              <div title={`${cell.approved} of ${cell.total} followed${cell.overdue ? `, ${cell.overdue} overdue` : ''}`}
                                   style={{
                                     background: scoreColor(cell.pct), color: '#fff', borderRadius: 4,
                                     padding: '4px 6px', fontSize: 12, fontWeight: 600, opacity: 0.15 + (cell.pct / 100) * 0.85,
                                   }}>
                                {cell.pct}%
                              </div>
                            ) : <span className="dim">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ----------------------------------------------------------- ACTIVITY */}
      {tab === 'activity' && (
        <div className="card">
          <div className="card-h"><h3>Recent activity</h3><span className="tiny muted">Newest first</span></div>
          <div className="card-b">
            {d.activity.length === 0 && <div className="empty">No activity recorded yet.</div>}
            <div className="tl">
              {d.activity.map(a => (
                <div className={`tl-i ${ACTION_TONE[a.action] ?? ''}`} key={a.id}>
                  <div className="tl-t">
                    <strong>{a.actor ?? 'System'}</strong> {ACTION_LABEL[a.action] ?? a.action}{' '}
                    <strong>{a.title}</strong> <span className="muted">({a.entity})</span>
                  </div>
                  {a.comment && <div className="small muted mt4">{a.comment}</div>}
                  <div className="tl-m mt4">{fmtDateTime(a.created_at)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
