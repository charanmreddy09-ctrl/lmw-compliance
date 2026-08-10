'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Ic, Stat, Delta, Kpi, Note, StatusPill, DataTable, RISK_TONE,
  scoreColor, fmtDate, fmtDateTime, daysFromToday, downloadFile, useToast, initials,
} from '@/components/ui';
import {
  ProgressRing, AnimatedNumber, BadgeV2, QuickTile, SkeletonCard, SkeletonTable,
  EmptyState, IllustrationAllClear,
} from '@/components/ui2';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
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
/** B1 / B2 - yesterday's movement and today's open exposure. */
type Sev = { Critical: number; High: number; Medium: number; Low: number };
type Brief = {
  approved: number; submitted: number; queries: number; rejected: number; escalated: number;
  severity: Sev; severityOverdue: Sev;
  dueTomorrow: { id: string; title: string; entity: string; country_code: string; risk_level: string }[];
  countriesAtRisk: { code: string; name: string; score: number; overdue: number }[];
};
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
  brief: Brief;
  scopeLabel: string;
  futureByCountry: Record<string, number>;
  futureOverall: number;
  availableFys: { startYear: number; label: string }[];
  selectedFy: number;
  fyLabel: string;
  syncedAt: string;
};

const ZERO_SCORE: ScoreBreakdown = {
  total: 0, approved: 0, submitted: 0, underReview: 0, queryRaised: 0, rejected: 0,
  evidencePending: 0, notStarted: 0, overdue: 0, filedLate: 0, avgDelayDays: 0,
  evidenceCoverage: 0, onTimeRate: 0, base: 0, overduePenalty: 0, delayPenalty: 0, score: 0,
  earnedPoints: 0, maxPoints: 0, evidenceQuality: 0, criticalShare: 0, criticalOverdue: 0,
};

const ACTION_LABEL: Record<string, string> = {
  submit: 'submitted', approve: 'approved', reject: 'rejected', query: 'raised a query on',
  comment: 'commented on', reassign: 'reassigned', delegate: 'delegated',
  escalate: 'escalated', resubmit: 'resubmitted', reopen: 'reopened',
};
const ACTION_ICON: Record<string, string> = {
  submit: 'upload', approve: 'check2', reject: 'x', query: 'alert',
  comment: 'doc', reassign: 'users', delegate: 'send', escalate: 'arrowR',
  resubmit: 'swap', reopen: 'swap',
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
function Pct({ n, of }: { n: number; of: number }) {
  const pct = of ? Math.round((n / of) * 100) : 0;
  return <span className="tiny dim" style={{ fontFamily: 'var(--font-sans)', marginLeft: 5 }}>({pct}%)</span>;
}
/** IST-anchored, matching the house timezone convention used everywhere else
    on this page (fmtDateTime etc.) - a "Good evening" at 6pm IST should not
    flip to "Good morning" for a viewer whose own clock reads midnight. */
function greeting(): string {
  const hr = Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }));
  return hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
}
/** Months from the start of financial year `fy` (April) up to and including
    the current month, IST — the dashboard's other FY-scoped figures already
    treat April as the FY anchor, so "YTD" here means the same thing. */
function ytdMonths(fy: number): number {
  const now = new Date();
  const y = now.getUTCFullYear(), m = now.getUTCMonth();
  const fyStartsThisCalendarYear = m >= 3; // Apr(3)..Dec
  const curFyStart = fyStartsThisCalendarYear ? y : y - 1;
  const monthsSinceFyStart = (y - curFyStart) * 12 + (m - 3) + 1;
  const extraFullYears = Math.max(0, curFyStart - fy) * 12;
  return Math.max(1, monthsSinceFyStart + extraFullYears);
}

function DashboardSkeleton() {
  return (
    <>
      <SkeletonCard height={150} />
      <div className="grid g-4 mt16 mb16">
        {Array.from({ length: 4 }, (_, i) => <SkeletonCard key={i} height={110} />)}
      </div>
      <SkeletonTable rows={6} cols={5} />
    </>
  );
}

export default function Dashboard() {
  const toast = useToast();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState('overview');
  const [countryFilter, setCountryFilter] = useState('');
  const [catTab, setCatTab] = useState<string>('overall');
  const [upcomingWindow, setUpcomingWindow] = useState<'yesterday' | 'today' | 'tomorrow' | '15d' | 'month'>('month');
  /* Defaults to the current FY (empty string until the first response names
     it) but a CFO can pick another year from the dropdown — comparing years
     is a legitimate dashboard question, not Reports-only. */
  const [fyFilter, setFyFilter] = useState<number | ''>('');
  const [chartRange, setChartRange] = useState<'6m' | '12m' | 'ytd'>('6m');
  const [hoveredSeg, setHoveredSeg] = useState<{ label: string; value: number } | null>(null);

  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let live = true;
    async function load(showSpinnerOnFail: boolean) {
      setSyncing(true);
      try {
        const params = new URLSearchParams();
        if (fyFilter !== '') params.set('fy', String(fyFilter));
        params.set('months', String(
          chartRange === '6m' ? 6 : chartRange === '12m' ? 12 : ytdMonths(fyFilter === '' ? new Date().getUTCFullYear() : fyFilter)));
        const qs = `?${params.toString()}`;
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
        /* First load, nothing chosen yet — adopt whatever FY the server
           defaulted to (the current one) so the dropdown reflects it. */
        if (fyFilter === '') setFyFilter(dash.selectedFy);
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
  }, [fyFilter, chartRange]);

  const isCfo = user?.role === 'CFO';

  if (err) return <Note kind="b">{err}</Note>;
  if (!d || !user) return <DashboardSkeleton />;

  const o = countryFilter ? (d.byCountryScore[countryFilter] ?? d.overall) : d.overall;
  const futureCount = countryFilter ? (d.futureByCountry[countryFilter] ?? 0) : d.futureOverall;
  /* Not gated by due date, unlike o.submitted/o.underReview - a submission
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
  /* Everything applicable that is neither approved nor overdue — still with
     the preparer, in review, or queried. Filling the composition ring's
     third segment with this keeps the ring's total honest without a fourth
     colour to explain. */
  const catInProgress = Math.max(0, catTotals.total - catTotals.approved - catTotals.overdue);

  /* Yesterday, today and tomorrow mean exactly that one day. The 15 and 30
     day windows keep their existing behaviour of also carrying anything
     already overdue, because a range view that hid a missed deadline would
     be the more dangerous of the two readings. */
  const upcomingShown = d.upcoming.filter(u => {
    const n = daysFromToday(u.due_date);
    if (n == null) return false;
    switch (upcomingWindow) {
      case 'yesterday': return n === -1;
      case 'today': return n === 0;
      case 'tomorrow': return n === 1;
      case '15d': return n <= 15;
      default: return n <= 30;
    }
  });

  /* B1 / B2 - the brief reads from counts the API already returned; nothing
     here re-derives a figure that exists server-side. */
  /* Destinations are role-aware: a preparer holds no reports.generate and a
     CFO deliberately has no review queue, so the same shortcut points each
     role at a screen it can actually open. */
  const canReport = user.permissions.includes('reports.generate');
  const canReview = user.permissions.includes('compliance.review') && !isCfo;

  /* Month-on-month movement, from the reconstructed trend series. */
  const trendDelta = d.trend.length >= 2
    ? d.trend[d.trend.length - 1].score - d.trend[d.trend.length - 2].score
    : 0;
  /* Critical and high-risk items already past due, counted from the same
     window the table below draws on so tile and rows always agree. */
  const criticalRisks = d.upcoming.filter(x => {
    const n = daysFromToday(x.due_date);
    return n != null && n < 0 && (x.risk_level === 'Critical' || x.risk_level === 'High');
  }).length;
  const dueThisWeek = d.upcoming.filter(x => {
    const n = daysFromToday(x.due_date);
    return n != null && n >= 0 && n <= 7;
  }).length;
  const openReturns = o.queryRaised + o.rejected;
  const overdueHref = canReport ? '/reports?r=overdue' : '/register';
  const evidenceHref = canReport ? '/reports?r=evidence' : '/register';
  /* Critical risks names an exact set (Critical/High, past due, unfiled) -
     the same condition the register's own "Immediate attention" deep link
     already uses, so the count clicked and the rows landed on agree, rather
     than reusing the generic overdue report every other overdue tile opens. */
  const criticalRisksHref = '/register?risk=Critical,High&attention=1';
  /* Pending reviews has no report of its own and a CFO holds no
     compliance.review, so this used to fall back to the executive summary -
     a different number entirely. The register's own multi-status filter
     (added alongside this) can show exactly the Submitted/Under Review set
     the tile counts, scoped to the same financial year. */
  const pendingReviewsHref = `/register?status=Submitted,Under Review&fy=${d.selectedFy}`;

  const b = d.brief;
  const movedYesterday = b.approved + b.submitted + b.queries + b.rejected + b.escalated;
  const attention = b.severity.Critical + b.severity.High + b.severity.Medium + b.severity.Low;

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'overall', label: 'Overall by country' },
    { id: 'entities', label: 'Entity scores' },
    { id: 'trends', label: 'Trends & heat map' },
    { id: 'activity', label: 'Recent activity' },
  ];

  /* Country x category grid, coloured by % followed - the same d.heat rows
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

  /* The hero ring's three segments — same "approved / everything else still
     open / overdue" split the act-tabs ring below already uses for a single
     category, just computed for the overall scope in view. */
  const heroInProgress = Math.max(0, o.total - o.approved - o.overdue);
  const heroSegments = [
    { key: 'approved', value: o.approved, color: 'var(--ok-600)', label: 'Approved' },
    { key: 'progress', value: heroInProgress, color: 'var(--navy-500)', label: 'In progress' },
    { key: 'overdue', value: o.overdue, color: 'var(--bad-600)', label: 'Overdue' },
  ].filter(s => s.value > 0);

  return (
    <>
      {/* --------------------------------------------------------- B1 / B2
          What happened yesterday and what is exposed today, stated before
          any chart. Everything here is a link: a brief that cannot be acted
          on from where it is read is just a newsletter. Nothing is invented -
          each figure is a count the API already returns. */}
      <div className="card mb16 dash-hero stagger-in stagger-1">
        <div className="dash-hero-top">
          <div className="dash-hero-greet">
            <h2>{greeting()}, {user.name.split(' ')[0]} 👋</h2>
            <p className="dash-hero-line">
              {attention === 0
                ? "Everything looks good — nothing needs your attention right now."
                : <>Everything looks good, but <strong>{attention} item{attention === 1 ? '' : 's'}</strong> need{attention === 1 ? 's' : ''} your attention this week.</>}
            </p>
            <span className="tiny muted">
              {new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
              {' · '}{d.scopeLabel}
            </span>
          </div>
          <div className="dash-hero-ring">
            <ProgressRing value={o.score} size={148} strokeWidth={13} segments={heroSegments}
                           onSegmentHover={seg => setHoveredSeg(seg)}
                           center={
                             <>
                               <div className="num" style={{ fontSize: 30, fontWeight: 700, color: 'var(--navy-900)', lineHeight: 1 }}>
                                 <AnimatedNumber value={o.score} decimals={1} />
                               </div>
                               <div className="tiny dim" style={{ marginTop: 2 }}>Compliance Health</div>
                             </>
                           } />
            <div className="dash-hero-legend">
              {hoveredSeg ? (
                <div className="tiny"><strong>{hoveredSeg.value}</strong> {hoveredSeg.label.toLowerCase()}</div>
              ) : <Delta value={trendDelta} />}
            </div>
          </div>
        </div>
        <div className="dash-hero-body card-b grid g-3" style={{ gap: 20 }}>
          <div>
            <div className="cap mb8">Since yesterday</div>
            {movedYesterday === 0 ? (
              <div className="small muted">No workflow activity was recorded yesterday.</div>
            ) : (
              <div className="stack">
                {b.approved > 0 && <div><span className="k">Approved</span><span className="v num" style={{ color: 'var(--ok-700)' }}>{b.approved}</span></div>}
                {b.submitted > 0 && <div><span className="k">Submitted for review</span><span className="v num">{b.submitted}</span></div>}
                {b.queries > 0 && <div><span className="k">Queries raised</span><span className="v num" style={{ color: 'var(--warn-700)' }}>{b.queries}</span></div>}
                {b.rejected > 0 && <div><span className="k">Rejected</span><span className="v num" style={{ color: 'var(--bad-600)' }}>{b.rejected}</span></div>}
                {b.escalated > 0 && <div><span className="k">Escalated</span><span className="v num" style={{ color: 'var(--bad-600)' }}>{b.escalated}</span></div>}
              </div>
            )}
          </div>

          <div id="attention">
            <div className="cap mb8">What needs your attention</div>
            {attention === 0 ? (
              <div className="small muted">Nothing due is currently unapproved.</div>
            ) : (
              /* Count sits against its label rather than pushed to the far edge,
                 and each row opens the register filtered to that risk level - a
                 severity figure a CFO cannot drill into is just a statistic. */
              <div className="sev-list">
                {(['Critical', 'High', 'Medium', 'Low'] as const)
                  .filter(k => b.severity[k] > 0)
                  .map(k => (
                    <Link key={k} href={`/register?risk=${k}&attention=1`} className="sev-row">
                      <span className="num sev-n">{b.severity[k]}</span>
                      <BadgeV2 tone={k === 'Critical' || k === 'High' ? 'bad' : k === 'Medium' ? 'warn' : 'mute'}
                               pulse={b.severityOverdue[k] > 0}>
                        {k}
                      </BadgeV2>
                      {b.severityOverdue[k] > 0 && (
                        <span className="tiny" style={{ color: 'var(--bad-600)' }}>
                          {b.severityOverdue[k]} overdue
                        </span>
                      )}
                      <span className="grow" />
                      <Ic n="chevR" s={14} />
                    </Link>
                  ))}
              </div>
            )}
            {isCfo && awaitingReviewer > 0 && (
              <div className="tiny muted mt8">{awaitingReviewer} submission{awaitingReviewer === 1 ? '' : 's'} awaiting a reviewer&apos;s decision.</div>
            )}
          </div>

          <div>
            <div className="cap mb8">Watch list</div>
            {b.dueTomorrow.length === 0 && b.countriesAtRisk.length === 0 && (
              <div className="small muted">Nothing falls due tomorrow and no country is currently flagged.</div>
            )}
            {b.dueTomorrow.length > 0 && (
              <div className="mb8">
                <div className="tiny dim mb4">Due tomorrow</div>
                {b.dueTomorrow.slice(0, 3).map(t => (
                  <Link key={t.id} href={`/register?obligation=${t.id}`}
                        className="small row g6" style={{ padding: '2px 0', color: 'var(--ink)' }}>
                    <span className={`pill ${RISK_TONE[t.risk_level] ?? 'p-mute'} nd tiny`}>{t.risk_level}</span>
                    <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </span>
                    <span className="tiny dim">{t.entity}</span>
                  </Link>
                ))}
              </div>
            )}
            {b.countriesAtRisk.length > 0 && (
              <div>
                <div className="tiny dim mb4">Countries to watch</div>
                <div className="row g6 wrap">
                  {b.countriesAtRisk.map(c => (
                    <button key={c.code} className="pill p-mute"
                            style={{ cursor: 'pointer', border: '1px solid var(--line)' }}
                            onClick={() => { setCountryFilter(c.code); setTab('overall'); }}>
                      {c.name} <span className="num strong" style={{ color: scoreColor(c.score) }}>{c.score.toFixed(0)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ----------------------------------------------------------- QUICK ACTIONS */}
      <div className="qa-grid mb16 stagger-in stagger-2">
        <QuickTile icon="book" label="Compliance Library" href="/compliance" />
        <QuickTile icon="cal" label="Open Calendar" href="/calendar" />
        {canReport && <QuickTile icon="report" label="View Reports" href="/reports" />}
        {canReview && <QuickTile icon="review" label="Review Queue" href="/reviews" />}
        <QuickTile icon="list" label="Compliance Register" href="/register" />
      </div>

      {/* ----------------------------------------------------------- KPI ROW
          The four figures that decide what happens next, and the shortcuts
          people actually use. Every tile is a link - a number on this
          dashboard is never a dead end - and every destination is role-aware,
          so a preparer holding no reports.generate is sent to the register
          rather than a report it would be refused. Card depth/hover comes
          free from .card-link in globals.css; the count-up is the only thing
          added here. */}
      <div className="mb16 stagger-in stagger-3">
        {/* The four figures differ by who is looking. The payload is already
            scoped to the user's entities, so a preparer's "overdue" is their
            own work, not the group's - what changes here is which four
            questions get answered, and where each one leads. */}
        <div className="grid g-4" style={{ gap: 16, alignContent: 'start' }}>
          {canReview ? (
            <>
              <Stat label="Awaiting your review" value={<AnimatedNumber value={awaitingReviewer} />} icon="review" tone={awaitingReviewer ? 'info' : 'ok'}
                    sub="Submitted with evidence" href="/reviews" cta="Open queue" />
              <Stat label="Open with preparers" value={<AnimatedNumber value={openReturns} />} icon="flag" tone={openReturns ? 'warn' : 'ok'}
                    sub="Queried or rejected" href="/reviews" cta="Open queue" />
              <Stat label="Overdue obligations" value={<AnimatedNumber value={o.overdue} />} icon="clock" tone={o.overdue ? 'warn' : 'ok'}
                    sub="Past due, no evidence filed" href={overdueHref} cta="View report" />
              <Stat label="Evidence coverage" value={<AnimatedNumber value={o.evidenceCoverage} decimals={1} />} unit="%" icon="shield"
                    tone={o.evidenceCoverage >= 90 ? 'ok' : 'warn'}
                    sub="Obligations with a document" href={evidenceHref} cta="View evidence" />
            </>
          ) : !isCfo ? (
            <>
              <Stat label="Due this week" value={<AnimatedNumber value={dueThisWeek} />} icon="cal" tone={dueThisWeek ? 'warn' : 'ok'}
                    sub="Falling due in the next 7 days" href="/register" cta="Open register" />
              <Stat label="Overdue" value={<AnimatedNumber value={o.overdue} />} icon="alert" tone={o.overdue ? 'bad' : 'ok'}
                    sub="Past due, not yet filed" href="/register" cta="Open register" />
              <Stat label="Returned to you" value={<AnimatedNumber value={openReturns} />} icon="flag" tone={openReturns ? 'warn' : 'ok'}
                    sub="Queried or rejected, needs correction" href="/register" cta="Open register" />
              <Stat label="Awaiting review" value={<AnimatedNumber value={awaitingReviewer} />} icon="review" tone="info"
                    sub="Filed, with a reviewer" href="/register" cta="Open register" />
            </>
          ) : (
            <>
              <Stat label="Critical risks" value={<AnimatedNumber value={criticalRisks} />} icon="alert" tone="bad"
                    sub="Critical or high risk, past due" href={criticalRisksHref} cta="View details" />
              <Stat label="Overdue obligations" value={<AnimatedNumber value={o.overdue} />} icon="clock" tone="warn"
                    sub="Past due, no evidence filed" href={overdueHref} cta="View report" />
              <Stat label="Pending reviews" value={<AnimatedNumber value={awaitingReviewer} />} icon="review" tone="info"
                    sub="Across all reviewers" href={pendingReviewsHref} cta="View details" />
              <Stat label="Evidence coverage" value={<AnimatedNumber value={o.evidenceCoverage} decimals={1} />} unit="%" icon="shield"
                    tone={o.evidenceCoverage >= 90 ? 'ok' : 'warn'}
                    sub="Obligations with a document" href={evidenceHref} cta="View evidence" />
            </>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------ headline */}
      <div className="card mb16 stagger-in stagger-4">
        <div className="card-h">
          <div>
            <h3>Score breakdown</h3>
            <div className="tiny muted mt4">
              Derived only from obligations carrying reviewer-approved evidence · {d.scopeLabel}
            </div>
          </div>
          <div className="row g12 no-print">
            <span className="tiny muted" title={new Date(d.syncedAt).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' }) + ' IST'}>
              <Ic n="swap" s={12} c={syncing ? 'var(--navy-600)' : 'var(--ink-4)'} />
              {' '}Auto-sync · updated {new Date(d.syncedAt).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST
            </span>
            <select value={fyFilter} onChange={e => setFyFilter(e.target.value ? Number(e.target.value) : '')} aria-label="Filter by financial year">
              {d.availableFys.map(f => <option key={f.startYear} value={f.startYear}>{f.label}</option>)}
            </select>
            <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)} aria-label="Filter by country">
              <option value="">All countries</option>
              {d.byCountry.map(c => <option key={c.countryCode} value={c.countryCode}>{c.countryName}</option>)}
            </select>
            <button className="btn btn-s"
                    onClick={() => downloadFile('/api/reports/executive?format=xlsx', 'Executive summary.xlsx', toast)}>
              <Ic n="download" s={13} /> Executive summary
            </button>
          </div>
        </div>
        <div className="card-b row g24 wrap">          <div className="grow" style={{ minWidth: 260 }}>
            <div className="stack">
              <div><span className="k">{countryFilter ? 'Total Obligations Applicable' : 'Applicable obligations'}</span><span className="v num">{o.total}</span></div>
              <div><span className="k">Approved with evidence</span><span className="v num">{o.approved}<Pct n={o.approved} of={o.total} /></span></div>
              <div><span className="k">Awaiting reviewer</span><span className="v num">{awaitingReviewer}</span></div>
              <div><span className="k">Query raised / rejected</span><span className="v num">{o.queryRaised + o.rejected}</span></div>
              <div><span className="k">Not started</span><span className="v num">{o.notStarted + o.evidencePending}</span></div>
              {o.overdue > 0 && (
                <div className="tiny" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 6, marginTop: -1, color: 'var(--bad-600)' }}>
                  {o.overdue} of them are past the due date with no evidence uploaded.
                </div>
              )}
            </div>
            <div className="row between g12" style={{ marginTop: 10, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 'var(--r)' }}>
              <span className="small muted">Future obligations <span className="dim">(not yet due - excluded from the figures above)</span></span>
              <span className="v num">{futureCount}</span>
            </div>
          </div>
          <div style={{ minWidth: 260 }}>
            <div className="cap mb8">{activeCat.label} - filing quality</div>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Kpi label="Evidence coverage" value={<>{catScore.evidenceCoverage}<Pctu /></>}
                   sub="Obligations with a document" bar={catScore.evidenceCoverage} />
              <Kpi label="On-time filing" value={<>{catScore.onTimeRate}<Pctu /></>}
                   sub="Filed by the due date" bar={catScore.onTimeRate} />
              <Kpi label="Awaiting review" value={catScore.submitted + catScore.underReview}
                   sub={isCfo ? 'Across all reviewers' : 'In the review queue'}
                   bar={catScore.total ? ((catScore.submitted + catScore.underReview) / catScore.total) * 100 : 0}
                   barColor="var(--navy-600)" />
              <Kpi label="Average delay" value={<>{catScore.avgDelayDays}<span style={{ fontSize: 13, fontFamily: 'var(--font-sans)', marginLeft: 2 }}>d</span></>}
                   sub="Where filed after due date"
                   bar={Math.min(100, catScore.avgDelayDays * 4)} barColor="var(--warn-600)" />
            </div>
          </div>
        </div>
      </div>

      {o.overdue > 0 && (
        <div className="mb16">
          <Note kind={o.overdue > o.total * 0.1 ? 'b' : 'w'}>
            <strong>{o.overdue} obligation{o.overdue === 1 ? '' : 's'} past the due date with no evidence uploaded.</strong>{' '}
            {worst.length > 0 && (
              <>Weakest countries: {worst.map(w => `${w.countryName} (${w.score})`).join(', ')}. </>
            )}
            <Link href="/reports?r=overdue" className="strong">Open the overdue report</Link>
          </Note>
        </div>
      )}

      {/* -------------------------------------------------------- ACT TABS
          Always visible at the top, next to the headline score - not buried
          in a tab further down the page. */}
      <div className="card act-tabs mb16 stagger-in stagger-5">
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
        <div className="card-b row g24 wrap">
          <div className="center" style={{ minWidth: 90 }}>
            <div className="num strong" style={{ fontSize: 30, color: scoreColor(catPct), lineHeight: 1 }}>
              {catPct}<span style={{ fontSize: 15, fontFamily: 'var(--font-sans)', marginLeft: 1 }}>%</span>
            </div>
            <div className="tiny dim mt4">followed</div>
          </div>
          <div className="stack" style={{ width: 300, flexShrink: 0 }}>
            <div><span className="k">Applicable</span><span className="v num">{catTotals.total}</span></div>
            <div><span className="k">Approved with evidence</span><span className="v num">{catTotals.approved}</span></div>
            <div><span className="k">Overdue and unfiled</span>
              <span className="v num" style={{ color: catTotals.overdue ? 'var(--bad-600)' : undefined }}>{catTotals.overdue}</span></div>
          </div>
          {catTotals.total > 0 ? (
            <div className="row g16" style={{ alignItems: 'center' }}>
              {(() => {
                const r = 40, C = 2 * Math.PI * r;
                const segs = [
                  { n: catTotals.approved, color: 'var(--ok-600)' },
                  { n: catInProgress, color: 'var(--navy-600)' },
                  { n: catTotals.overdue, color: 'var(--bad-600)' },
                ];
                let acc = 0;
                return (
                  <svg width={104} height={104} viewBox="0 0 104 104" style={{ flexShrink: 0 }}>
                    <circle cx={52} cy={52} r={r} fill="none" stroke="var(--line-2)" strokeWidth={12} />
                    {segs.filter(s => s.n > 0).map((s, i) => {
                      const frac = s.n / catTotals.total;
                      const dash = `${frac * C} ${C - frac * C}`;
                      const offset = -acc * C;
                      acc += frac;
                      return (
                        <circle key={i} cx={52} cy={52} r={r} fill="none" stroke={s.color} strokeWidth={12}
                                strokeDasharray={dash} strokeDashoffset={offset}
                                transform="rotate(-90 52 52)" strokeLinecap="butt" />
                      );
                    })}
                  </svg>
                );
              })()}
              <div className="stack" style={{ width: 170, flexShrink: 0 }}>
                <div className="row g8" style={{ alignItems: 'center' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--ok-600)', flexShrink: 0 }} />
                  <span className="tiny muted grow">Approved</span>
                  <span className="tiny num strong">{catTotals.approved}</span>
                </div>
                <div className="row g8" style={{ alignItems: 'center' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--navy-600)', flexShrink: 0 }} />
                  <span className="tiny muted grow">In progress</span>
                  <span className="tiny num strong">{catInProgress}</span>
                </div>
                <div className="row g8" style={{ alignItems: 'center' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 2, background: 'var(--bad-600)', flexShrink: 0 }} />
                  <span className="tiny muted grow">Overdue</span>
                  <span className="tiny num strong">{catTotals.overdue}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="grow small muted">No applicable obligations in this category for the current filter.</div>
          )}
        </div>
      </div>

      <div className="tabs no-print stagger-in stagger-6">
        {TABS.map(t => (
          <button key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------ OVERVIEW */}
      {tab === 'overview' && (
        <>
          {entityRanked.length > 1 && (
            <div className="mb16">
              <div className="row between mb8">
                <h3 style={{ fontSize: 13.5 }}>Entity performance</h3>
                <button className="btn btn-xs no-print" onClick={() => setTab('entities')}>
                  All entities <Ic n="arrowR" s={12} />
                </button>
              </div>
              <div className="grid g-3">
                {[...entityRanked].reverse().slice(0, 3).map(e => {
                  const s = e.s!;
                  return (
                    <Link key={e.id} href={`/entities/${e.id}`} className="card card-link hoverable">
                      <div className="card-b">
                        <div className="row between" style={{ marginBottom: 4 }}>
                          <div className="t1 strong">{e.short_name}</div>
                          <span className="num strong" style={{ color: scoreColor(s.score) }}>{s.score.toFixed(0)}<Pctu /></span>
                        </div>
                        <div className="tiny muted mb8">{s.total} obligations · {e.country_name}</div>
                        <div className="bar" style={{ marginBottom: 10 }}>
                          <i style={{ width: `${s.score}%`, background: scoreColor(s.score) }} />
                        </div>
                        <div className="row g8">
                          {s.submitted + s.underReview > 0 && <BadgeV2 tone="info">{s.submitted + s.underReview} due soon</BadgeV2>}
                          {s.overdue > 0 && <BadgeV2 tone="bad" pulse>{s.overdue} overdue</BadgeV2>}
                          {s.overdue === 0 && s.submitted + s.underReview === 0 && <BadgeV2 tone="ok">All clear</BadgeV2>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card mb16">
            <div className="card-h"><h3>Recent due date changes</h3></div>
            <div className="card-b">
              {d.dueChanges.length === 0 && <div className="small muted">No due date changes recorded.</div>}
              <div className="grid g-3">
                {d.dueChanges.slice(0, 6).map(c => (
                  <div key={c.id} className="row-t g8" style={{ padding: '7px 0', borderBottom: '1px solid var(--line-2)' }}>
                    <span className="pill p-mute nd tiny">{c.country_code}</span>
                    <div className="grow">
                      <div className="small strong">{c.title ?? 'Obligation'}</div>
                      <div className="tiny muted">
                        {fmtDate(c.old_due_date)} <Ic n="arrowR" s={10} /> <strong>{fmtDate(c.new_due_date)}</strong>
                        {c.entity ? ` · ${c.entity}` : ''}
                      </div>
                      {c.reason && <div className="tiny dim mt4">{c.reason}</div>}
                    </div>
                  </div>
                ))}
              </div>
              {d.dueChanges.length > 0 && (
                <Link href="/calendar" className="btn btn-s mt12 no-print"><Ic n="cal" s={13} /> Open calendar</Link>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <div>
                <h3>{isCfo ? 'Compliance due' : 'Your compliance due'}</h3>
                <span className="tiny muted">{upcomingShown.length} items</span>
              </div>
              <div className="seg no-print">
                {([
                  ['yesterday', 'Yesterday'],
                  ['today', 'Today'],
                  ['tomorrow', 'Tomorrow'],
                  ['15d', '15 days'],
                  ['month', '30 days'],
                ] as const).map(([id, label]) => (
                  <button key={id} className={upcomingWindow === id ? 'on' : ''}
                          onClick={() => setUpcomingWindow(id)}>{label}</button>
                ))}
              </div>
            </div>
            <DataTable<Upcoming & Record<string, unknown>>
              rows={upcomingShown as (Upcoming & Record<string, unknown>)[]}
              rowKey={r => r.id}
              pageSize={12}
              onRow={r => { window.location.href = `/register?obligation=${r.id}`; }}
              empty="Nothing due here — you're all caught up in this window."
              cols={[
                { key: 'due_date', label: 'Due', sort: true, cls: 'nowrap',
                  render: r => {
                    const n = daysFromToday(r.due_date);
                    const dt = new Date(r.due_date.length === 10 ? r.due_date + 'T00:00:00Z' : r.due_date);
                    const overdue = n != null && n < 0;
                    const soon = n != null && n >= 0 && n <= 2;
                    return (
                      <div className="row g8">
                        <div style={{
                          width: 34, height: 34, borderRadius: 9, flexShrink: 0, textAlign: 'center',
                          background: overdue ? 'var(--bad-100)' : soon ? 'var(--warn-100)' : 'var(--navy-050)',
                          color: overdue ? 'var(--bad-700)' : soon ? 'var(--warn-700)' : 'var(--navy-700)',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.1,
                        }}>
                          <span style={{ fontSize: 12, fontWeight: 700 }}>{dt.getUTCDate()}</span>
                          <span style={{ fontSize: 8, textTransform: 'uppercase', fontWeight: 600 }}>
                            {dt.toLocaleDateString('en-GB', { month: 'short' })}
                          </span>
                        </div>
                        <div className="t2" style={{ color: overdue ? 'var(--bad-600)' : undefined }}>
                          {n == null ? '' : n < 0 ? `${-n} d overdue` : n === 0 ? 'today' : `in ${n} d`}
                        </div>
                      </div>
                    );
                  } },
                { key: 'title', label: 'Compliance', sort: true, cls: 'w',
                  render: r => (<><div className="t1">{r.title}</div>
                    <div className="t2">{r.entity} · {r.period_label}{r.form_reference ? ` · ${r.form_reference}` : ''}</div></>) },
                { key: 'status', label: 'Status', sort: true, render: r => <StatusPill s={r.status} /> },
                /* The CFO monitors and delegates; filing is not part of that
                   role, and the register it would open is not in its
                   navigation either. It gets a view action instead. */
                { key: 'actions', label: '', cls: 'nowrap no-print',
                  render: r => isCfo ? (
                    <Link href={`/register?obligation=${r.id}`} className="btn btn-xs"
                          onClick={e => e.stopPropagation()} title="Open this obligation">
                      <Ic n="eye" s={12} /> View
                    </Link>
                  ) : (
                    <Link href={`/register?obligation=${r.id}`} className="btn btn-p btn-xs"
                          onClick={e => e.stopPropagation()}>
                      <Ic n="upload" s={12} /> File
                    </Link>
                  ) },
              ]}
            />
          </div>
        </>
      )}

      {/* ---------------------------------------------- OVERALL BY COUNTRY (CFO) */}
      {tab === 'overall' && (
        <>
          <Note kind="i">
            Country-specific compliances that apply to the entities in that country, and how
            many of them are actually followed - evidenced and approved. This is the
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
                  <thead><tr><th>Law</th><th className="right">Applicable</th>
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
                      <td className="small">{e.division_name ?? '-'}</td>
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
              <div>
                <h3>Compliance Performance</h3>
                <span className="tiny muted">Reconstructed from approval and filing dates, not a point-in-time reading</span>
              </div>
              <div className="seg no-print">
                {(['6m', '12m', 'ytd'] as const).map(id => (
                  <button key={id} className={chartRange === id ? 'on' : ''} onClick={() => setChartRange(id)}>
                    {id === '6m' ? '6 Months' : id === '12m' ? '12 Months' : 'YTD'}
                  </button>
                ))}
              </div>
            </div>
            <div className="card-b" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d.trend} margin={{ top: 10, right: 12, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--navy-600)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--navy-600)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--line-2)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--ink-4)' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--ink-4)' }} axisLine={false} tickLine={false} width={34} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: '1px solid var(--line)', fontSize: 12, boxShadow: 'var(--shadow-hover)' }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(value: any) => [`${value}%`, 'Compliance']}
                    labelFormatter={l => l} />
                  <Area type="monotone" dataKey="score" stroke="var(--navy-600)" strokeWidth={2.5}
                        fill="url(#trendFill)" dot={{ r: 3.5, fill: 'var(--navy-600)', strokeWidth: 0 }}
                        activeDot={{ r: 5 }} isAnimationActive animationDuration={700} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Heat map - country × category</h3>
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
                            ) : <span className="dim">-</span>}
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
            {d.activity.length === 0 ? (
              <EmptyState icon={<IllustrationAllClear size={80} />} title="No activity recorded yet"
                          body="Approvals, queries and filings will show up here as they happen." />
            ) : (
              <div className="tl2">
                {d.activity.map(a => (
                  <div className="tl2-item" key={a.id}>
                    <div className={`tl2-node ${ACTION_TONE[a.action] ?? ''}`}><Ic n={ACTION_ICON[a.action] ?? 'info'} s={13} /></div>
                    <div className="tl2-body">
                      <div className="small">
                        {a.actor && <span className="tl2-avatar">{initials(a.actor)}</span>}
                        <strong>{a.actor ?? 'System'}</strong> {ACTION_LABEL[a.action] ?? a.action}{' '}
                        <strong>{a.title}</strong> <span className="muted">({a.entity})</span>
                      </div>
                      {a.comment && <div className="small muted mt4">{a.comment}</div>}
                      <div className="tl-m mt4">{fmtDateTime(a.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
