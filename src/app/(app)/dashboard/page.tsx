'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Ic, Dial, Kpi, Note, Spinner, StatusPill, DataTable,
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
  upcoming: Upcoming[];
  activity: Activity[];
  dueChanges: DueChange[];
  pendingReview: number;
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
function Pct({ n, of }: { n: number; of: number }) {
  const pct = of ? Math.round((n / of) * 100) : 0;
  return <span className="tiny dim" style={{ fontFamily: 'var(--font-sans)', marginLeft: 5 }}>({pct}%)</span>;
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

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'overall', label: 'Overall by country' },
    { id: 'entities', label: 'Entity scores' },
    { id: 'activity', label: 'Recent activity' },
  ];

  return (
    <>
      {/* ------------------------------------------------------------ headline */}
      <div className="card mb16">
        <div className="card-h">
          <div>
            <h3>Group compliance score</h3>
            <div className="tiny muted mt4">
              Derived only from obligations carrying reviewer-approved evidence · {d.scopeLabel}
            </div>
          </div>
          <div className="row g12 no-print">
            <span className="tiny muted" title={new Date(d.syncedAt).toLocaleString()}>
              <Ic n="swap" s={12} c={syncing ? 'var(--navy-600)' : 'var(--ink-4)'} />
              {' '}Auto-sync · updated {new Date(d.syncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <select value={fyFilter} onChange={e => setFyFilter(e.target.value ? Number(e.target.value) : '')} aria-label="Filter by financial year">
              <option value="">All years</option>
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
        <div className="card-b row g24 wrap">
          <Dial value={o.score} size={112} />
          <div className="grow" style={{ minWidth: 260 }}>
            <div className="stack">
              <div><span className="k">{countryFilter ? 'Total Obligations Applicable' : 'Applicable obligations'}</span><span className="v num">{o.total}</span></div>
              <div><span className="k">Approved with evidence</span><span className="v num">{o.approved}<Pct n={o.approved} of={o.total} /></span></div>
              <div><span className="k">Awaiting reviewer</span><span className="v num">{o.submitted + o.underReview}</span></div>
              <div><span className="k">Query raised / rejected</span><span className="v num">{o.queryRaised + o.rejected}</span></div>
              <div><span className="k">Not started</span><span className="v num">{o.notStarted + o.evidencePending}</span></div>
              {o.overdue > 0 && (
                <div className="tiny" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 6, marginTop: -1, color: 'var(--bad-600)' }}>
                  {o.overdue} of them are past the due date with no evidence uploaded.
                </div>
              )}
            </div>
            <div className="row between g12" style={{ marginTop: 10, padding: '8px 10px', background: 'var(--surface-2)', borderRadius: 'var(--r)' }}>
              <span className="small muted">Future obligations <span className="dim">(not yet due — excluded from the figures above)</span></span>
              <span className="v num">{futureCount}</span>
            </div>
          </div>
          <div style={{ minWidth: 260 }}>
            <div className="cap mb8">{activeCat.label} — filing quality</div>
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
          <div className="grow" />
          {catTotals.total === 0 && (
            <div className="small muted">No applicable obligations in this category for the current filter.</div>
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
              <div className="row g4 no-print">
                {([['day', 'Day'], ['15d', '15 days'], ['month', 'Month']] as const).map(([id, label]) => (
                  <button key={id} className={`btn btn-s${upcomingWindow === id ? ' btn-p' : ''}`}
                          onClick={() => setUpcomingWindow(id)}>{label}</button>
                ))}
              </div>
            </div>
            <DataTable<Upcoming & Record<string, unknown>>
              rows={upcomingShown as (Upcoming & Record<string, unknown>)[]}
              rowKey={r => r.id}
              pageSize={12}
              onRow={r => { window.location.href = `/register?obligation=${r.id}`; }}
              empty="Nothing falls due in this window."
              cols={[
                { key: 'due_date', label: 'Due', sort: true, cls: 'nowrap',
                  render: r => {
                    const n = daysFromToday(r.due_date);
                    return (
                      <>
                        <div className="num">{fmtDate(r.due_date)}</div>
                        <div className="t2" style={{ color: n != null && n < 0 ? 'var(--bad-600)' : undefined }}>
                          {n == null ? '' : n < 0 ? `${-n} d overdue` : n === 0 ? 'today' : `in ${n} d`}
                        </div>
                      </>
                    );
                  } },
                { key: 'title', label: 'Compliance', sort: true, cls: 'w',
                  render: r => (<><div className="t1">{r.title}</div>
                    <div className="t2">{r.entity} · {r.period_label}{r.form_reference ? ` · ${r.form_reference}` : ''}</div></>) },
                { key: 'status', label: 'Status', sort: true, render: r => <StatusPill s={r.status} /> },
                { key: 'actions', label: '', cls: 'nowrap no-print',
                  render: r => (
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
