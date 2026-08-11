'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Ic, Note, Spinner, useToast, downloadFile, fmtDateTime, scoreColor } from '@/components/ui';
import {
  OUTCOME_POINTS, DEDUCTIONS, CRITICALITY_WEIGHT, EVIDENCE_TIERS,
  EVIDENCE_UNCLASSIFIED, EVIDENCE_FLOOR,
} from '@/lib/scoring-config';

type Report = {
  type: string; title: string; rows: Record<string, unknown>[];
  extraSheets: { name: string; rows: Record<string, unknown>[] }[];
  generatedAt: string; generatedBy: string;
  availableFys: { startYear: number; label: string }[];
  categories: { id: string; name: string }[];
  notStarted?: boolean;
  periodLabel?: string | null;
};

const QUARTERS = [
  { id: 'Q1', label: 'Q1 (Apr–Jun)', months: [4, 5, 6] },
  { id: 'Q2', label: 'Q2 (Jul–Sep)', months: [7, 8, 9] },
  { id: 'Q3', label: 'Q3 (Oct–Dec)', months: [10, 11, 12] },
  { id: 'Q4', label: 'Q4 (Jan–Mar)', months: [1, 2, 3] },
] as const;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Calendar year a given FY month falls in, given the FY's start year
    (e.g. FY2026-27 -> Jan-Mar 2027, Apr-Dec 2026). */
function calYearForMonth(fyStartYear: number, month1to12: number): number {
  return month1to12 >= 4 ? fyStartYear : fyStartYear + 1;
}

const REPORTS = [
  { id: 'executive', name: 'Executive summary', icon: 'report',
    d: 'The headline numbers for the Board: score, coverage, timeliness and exposure, with country and entity annexures.' },
  { id: 'division', name: 'Division summary', icon: 'dash',
    d: 'Compliance position by operating division.' },
  { id: 'category', name: 'Law summary', icon: 'book',
    d: 'Where the group is strong and weak by law - tax, payroll, environmental and so on.' },
  { id: 'overdue', name: 'Overdue register', icon: 'alert',
    d: 'Every obligation past its due date with no evidence, ranked by how late it is, with penalty exposure.' },
  { id: 'delay', name: 'Delay analysis', icon: 'clock',
    d: 'Filings made after the due date, the delay in days and the penalty exposure recorded against each.' },
  { id: 'evidence', name: 'Evidence register', icon: 'doc',
    d: 'Full document inventory: what was uploaded, by whom, when, its version and validation outcome.' },
  { id: 'methodology', name: 'Score methodology', icon: 'info',
    d: 'How the compliance score shown across this platform is actually calculated.' },
  { id: 'mis', name: 'MIS', icon: 'sheet',
    d: 'The standing pack of periodic reports — management, audit committee, board and the annual certificate.' },
];

/** Each MIS item is a themed lens onto a report the platform already
    generates — reusing that data rather than standing up a second copy of
    the same numbers under a different name. */
const MIS_ITEMS = [
  { id: 'monthly', freq: 'Monthly', name: 'Management Report', reportType: 'division',
    d: 'Compliance position by operating division, for management review.' },
  { id: 'audit_committee', freq: 'Quarterly', name: 'Audit Committee Report', reportType: 'overdue',
    d: 'Overdue and unfiled obligations — the exposure an audit committee reviews.' },
  { id: 'board', freq: 'Quarterly', name: 'Board Compliance Report', reportType: 'executive',
    d: 'The headline numbers for the Board: score, coverage, timeliness and exposure.' },
  { id: 'certificate', freq: 'Annual', name: 'Compliance Certificate', reportType: 'executive',
    d: 'A signed-style statement of the Group’s compliance position for the year.' },
] as const;

function ReportsInner() {
  const search = useSearchParams();
  const toast = useToast();
  const [active, setActive] = useState(search.get('r') ?? 'executive');
  const [misSub, setMisSub] = useState<string | null>(null);
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(active !== 'methodology');
  const [err, setErr] = useState<string | null>(null);
  const [fy, setFy] = useState<number | ''>('');
  const [category, setCategory] = useState('');
  const [misQuarter, setMisQuarter] = useState('');
  const [misMonth, setMisMonth] = useState('');

  const misItem = active === 'mis' && misSub ? MIS_ITEMS.find(m => m.id === misSub) : null;
  /* The MIS index (active === 'mis', nothing picked yet) fetches nothing of
     its own — it's a menu onto reports that already exist. Once an item is
     picked, everything downstream (fetch, FY/law filters, export) targets
     that report's real underlying type. */
  const fetchType = misItem ? misItem.reportType : active;
  const showQuarterPicker = misSub === 'audit_committee' || misSub === 'board' || misSub === 'monthly';
  const showMonthPicker = misSub === 'monthly';

  /* Month options for the Monthly Management Report - narrowed to the
     selected quarter's 3 months once one is picked, per the client's ask,
     otherwise the full FY. */
  const monthOptions = (() => {
    if (fy === '') return [];
    const months = misQuarter
      ? (QUARTERS.find(q => q.id === misQuarter)?.months ?? [])
      : [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
    return months.map(m => {
      const calYear = calYearForMonth(fy, m);
      return { value: `${calYear}-${String(m).padStart(2, '0')}`, label: `${MONTH_NAMES[m - 1]} ${calYear}` };
    });
  })();

  const load = useCallback(async (type: string, fyVal: number | '') => {
    if (type === 'methodology' || (type === 'mis' && !misItem)) { setLoading(false); setData(null); setErr(null); return; }
    setLoading(true); setErr(null);
    try {
      const p = new URLSearchParams();
      if (fyVal !== '') p.set('fy', String(fyVal));
      /* The Law summary report is itself grouped by law, so filtering it to
         one would just leave a single row — every other report can be
         narrowed to a single law. */
      if (fetchType !== 'category' && category) p.set('category', category);
      if (showMonthPicker && misMonth) p.set('month', misMonth);
      if (showQuarterPicker && (misSub === 'audit_committee' || misSub === 'board') && misQuarter) p.set('quarter', misQuarter);
      const res = await fetch(`/api/reports/${fetchType}?${p}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Unable to generate the report.');
      setData(j);
      /* Default to the most recent financial year, same rule as the
         dashboard and the compliance library - a report should open on the
         current FY, not every FY blended together. */
      if (fyVal === '' && j.availableFys?.length) setFy(j.availableFys[0].startYear);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to generate the report.');
      setData(null);
    } finally { setLoading(false); }
  }, [category, fetchType, misItem, misMonth, misQuarter, misSub, showMonthPicker, showQuarterPicker]);

  useEffect(() => { load(active, fy); }, [active, misSub, fy, misQuarter, misMonth, load]);

  /* Switching MIS reports (or the FY) clears any month/quarter already picked
     for a different item - a quarter chosen while looking at the Board report
     should not silently carry over to a different FY's Audit Committee report. */
  useEffect(() => { setMisQuarter(''); setMisMonth(''); }, [misSub, fy]);

  /* Once a quarter is available, default (or re-snap) the Monthly report's
     month to the current calendar month if it falls inside the selected
     FY/quarter, otherwise to that quarter/FY's first month. Runs whenever the
     quarter changes too, so a month picked under one quarter doesn't survive
     - stale and no longer even listed - once a different quarter narrows the
     options, which would otherwise keep querying the old, now-invisible month. */
  useEffect(() => {
    if (!showMonthPicker || fy === '') return;
    const opts = monthOptions;
    if (!opts.length) return;
    if (misMonth && opts.some(o => o.value === misMonth)) return;
    const todayYm = new Date().toISOString().slice(0, 7);
    setMisMonth(opts.some(o => o.value === todayYm) ? todayYm : opts[0].value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMonthPicker, fy, misQuarter]);

  const meta = misItem ?? REPORTS.find(r => r.id === active);
  /* The generic data-table view only applies to a real report — not the MIS
     index list, and not the Certificate, which gets its own presentation
     rather than reading as a raw table. */
  const showGenericTable = active !== 'methodology'
    && (active !== 'mis' || (!!misItem && misItem.id !== 'certificate'));
  const cols = data?.rows.length ? Object.keys(data.rows[0]) : [];
  /* A column is numeric if every row's value for it is a number (or blank) -
     checked across all rows, not just the first, so a column doesn't end up
     with its header aligned one way and its body cells the other. Centred,
     not right-aligned, to match a scorecard's usual layout. */
  const isNumericCol = (rows: Record<string, unknown>[], key: string) =>
    rows.length > 0 && rows.every(r => typeof r[key] === 'number' || r[key] == null || r[key] === '');

  function cell(v: unknown, key: string) {
    if (v === null || v === undefined || v === '') return <span className="dim">-</span>;
    if (key === 'Download' && typeof v === 'string') {
      return <a className="btn btn-xs" href={v} target="_blank" rel="noopener">
        <Ic n="download" s={12} /> Download
      </a>;
    }
    if (typeof v === 'number') {
      const isScore = /score|%/i.test(key);
      return <span className="num" style={isScore ? { color: scoreColor(v), fontWeight: 600 } : undefined}>
        {v.toLocaleString()}
      </span>;
    }
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      return <span className="num nowrap">{new Date(s).toLocaleDateString('en-GB',
        { day: '2-digit', month: 'short', year: 'numeric' })}</span>;
    }
    return s;
  }

  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: '270px 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card no-print" style={{ position: 'sticky', top: 68 }}>
          <div className="card-h"><h3>Reports</h3></div>
          <div className="rpt-grid" style={{ gridTemplateColumns: '1fr', padding: 12 }}>
            {REPORTS.map(r => (
              <button key={r.id} className={`rpt-card${active === r.id ? ' on' : ''}`}
                      onClick={() => { setActive(r.id); setMisSub(null); }}>
                <span className="ri"><Ic n={r.icon} s={16} /></span>
                <span className="rt">{r.name}</span>
                <span className="rd">{r.d}</span>
              </button>
            ))}
          </div>
          <div className="card-f tiny muted">
            Every report respects the entities assigned to you, so a country head only ever
            exports their own scope.
          </div>
        </div>

        <div>
          <div className="card mb16">
            <div className="card-h">
              <div>
                {active === 'mis' && misItem && (
                  <button className="btn btn-xs no-print mb8" onClick={() => setMisSub(null)}>
                    <Ic n="back" s={11} /> All MIS reports
                  </button>
                )}
                <h3>
                  {active === 'mis' && misItem && (
                    <span className="pill p-mute nd tiny" style={{ marginRight: 8 }}>{misItem.freq}</span>
                  )}
                  {meta?.name ?? 'Report'}
                </h3>
                <div className="tiny muted mt4">{meta?.d}</div>
              </div>
              {active !== 'methodology' && (active !== 'mis' || misItem) && (
                <div className="row g6 no-print">
                  {data && data.availableFys.length > 0 && (
                    <select value={fy} onChange={e => setFy(e.target.value ? Number(e.target.value) : '')}
                            aria-label="Filter by financial year">
                      {data.availableFys.map(f => <option key={f.startYear} value={f.startYear}>{f.label}</option>)}
                    </select>
                  )}
                  {fetchType !== 'category' && data && data.categories.length > 0 && (
                    <select value={category} onChange={e => setCategory(e.target.value)}
                            aria-label="Filter by law">
                      <option value="">All laws</option>
                      {data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                  {showQuarterPicker && fy !== '' && (
                    <select value={misQuarter} onChange={e => setMisQuarter(e.target.value)}
                            aria-label="Filter by quarter">
                      <option value="">{showMonthPicker ? 'All quarters' : 'Select quarter…'}</option>
                      {QUARTERS.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
                    </select>
                  )}
                  {showMonthPicker && fy !== '' && (
                    <select value={misMonth} onChange={e => setMisMonth(e.target.value)}
                            aria-label="Filter by month">
                      {monthOptions.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  )}
                  <button className="btn btn-s" onClick={() => window.print()}>
                    <Ic n="doc" s={13} /> Print / PDF
                  </button>
                  <button className="btn btn-p btn-s"
                          onClick={() => {
                            const p = new URLSearchParams({ format: 'xlsx' });
                            if (fy !== '') p.set('fy', String(fy));
                            if (fetchType !== 'category' && category) p.set('category', category);
                            if (showMonthPicker && misMonth) p.set('month', misMonth);
                            if ((misSub === 'audit_committee' || misSub === 'board') && misQuarter) p.set('quarter', misQuarter);
                            downloadFile(`/api/reports/${fetchType}?${p}`, `SGCMP_${misItem ? misSub : active}.xlsx`, toast);
                          }}>
                    <Ic n="download" s={13} /> Excel
                  </button>
                </div>
              )}
            </div>
            {data && active !== 'methodology' && (active !== 'mis' || misItem) && (
              <div className="card-f row between wrap g8">
                <span className="tiny muted">
                  Generated {fmtDateTime(data.generatedAt)} by {data.generatedBy} ·
                  {' '}{data.rows.length} row{data.rows.length === 1 ? '' : 's'}
                </span>
                <span className="tiny muted">Global Compliance Management Platform</span>
              </div>
            )}
          </div>

          {active === 'mis' && !misItem && (
            <div className="rpt-grid">
              {MIS_ITEMS.map(m => (
                <button key={m.id} className="rpt-card" onClick={() => setMisSub(m.id)}>
                  <span className="row between" style={{ width: '100%' }}>
                    <span className="ri"><Ic n={REPORTS.find(r => r.id === m.reportType)?.icon ?? 'sheet'} s={16} /></span>
                    <span className={`pill ${m.freq === 'Monthly' ? 'p-warn' : m.freq === 'Annual' ? 'p-ok' : 'p-info'} nd tiny`}>
                      {m.freq}
                    </span>
                  </span>
                  <span className="rt">{m.name}</span>
                  <span className="rd">{m.d}</span>
                  <span className="rgo">Open <Ic n="chevR" s={12} /></span>
                </button>
              ))}
            </div>
          )}

          {active === 'mis' && misItem?.id === 'certificate' && data && !loading && (
            <div className="card">
              <div className="card-b" style={{ padding: 32, textAlign: 'center' }}>
                <div className="cap mb16" style={{ letterSpacing: '.12em' }}>Compliance Certificate</div>
                <p className="small" style={{ maxWidth: 560, margin: '0 auto 20px' }}>
                  This is to certify that, for the financial year in scope, the Group's compliance
                  position — derived solely from obligations carrying reviewer-approved documentary
                  evidence — stood as set out below. No representation letters were relied upon in
                  arriving at this position.
                </p>
                <div className="row g24 wrap" style={{ justifyContent: 'center' }}>
                  {data.rows.map((r, i) => (
                    <div key={i}>
                      <div className="tiny dim">{String(r.Metric)}</div>
                      <div className="num strong" style={{ fontSize: 20 }}>{String(r.Value)}</div>
                    </div>
                  ))}
                </div>
                <p className="tiny dim mt16">
                  Generated {fmtDateTime(data.generatedAt)} by {data.generatedBy} · Global Compliance Management Platform
                </p>
              </div>
            </div>
          )}

          {active === 'methodology' && (
            <div className="card">
              <div className="card-b">
                <p className="small mb12">
                  The compliance score shown across this platform - on the dashboard, in the
                  register and in every report - is derived only from obligations that carry
                  reviewer-approved documentary evidence. It cannot be inflated by self-declaration,
                  and it is calculated the same way for every entity, country and the group overall.
                </p>
                <Note kind="i">
                  <strong>Changed in version 1.2.</strong> The score was previously a flat ratio of
                  approved to applicable obligations. It is now weighted by how critical each
                  compliance is and by the quality of the evidence behind it, so a missed GST return
                  no longer costs the same as a late professional-tax return. Scores moved when this
                  took effect; the underlying filings did not.
                </Note>

                <div className="cap mt16 mb8">The formula</div>
                <div className="note note-i num mb16" style={{ display: 'block', textAlign: 'center' }}>
                  score = Σ (outcome points × criticality) ÷ Σ (100 × criticality) × 100
                </div>

                <div className="cap mb8">1 · Outcome points, per obligation</div>
                <div className="tw mb16">
                  <table className="dt">
                    <thead><tr><th>Outcome</th><th className="right">Points</th></tr></thead>
                    <tbody>
                      {([
                        ['Approved, filed on or before the due date', OUTCOME_POINTS.approvedOnTime],
                        ['Approved, but filed late', OUTCOME_POINTS.approvedLate],
                        ['Filed with evidence, awaiting a reviewer', OUTCOME_POINTS.awaitingReview],
                        ['Query raised, back with the preparer', OUTCOME_POINTS.queryRaised],
                        ['Rejected by the reviewer', OUTCOME_POINTS.rejected],
                        ['Past due with no evidence', OUTCOME_POINTS.overdueNoEvidence],
                      ] as const).map(([label, pts]) => (
                        <tr key={label}><td>{label}</td><td className="right num strong">{pts}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="cap mb8">2 · Adjustments, applied then clamped to 0–100</div>
                <div className="tw mb16">
                  <table className="dt">
                    <thead><tr><th>Condition</th><th className="right">Points</th></tr></thead>
                    <tbody>
                      <tr><td>Late, and this compliance was already filed late for this entity in an
                        earlier period</td><td className="right num strong">{DEDUCTIONS.repeatedDelay}</td></tr>
                      <tr><td>A Critical-risk obligation past its due date</td>
                        <td className="right num strong">{DEDUCTIONS.criticalOverdue}</td></tr>
                      <tr><td>Past due with no document on file at all</td>
                        <td className="right num strong">{DEDUCTIONS.missingEvidence}</td></tr>
                    </tbody>
                  </table>
                </div>

                <div className="cap mb8">3 · Criticality multiplier</div>
                <p className="small mb8">
                  Taken from the risk level recorded against the compliance in the library. It
                  multiplies both the points earned and the points available, so a portfolio of
                  mostly critical obligations is not penalised simply for being critical.
                </p>
                <div className="row g8 wrap mb16">
                  {Object.entries(CRITICALITY_WEIGHT).map(([level, w]) => (
                    <span key={level} className="pill p-mute nd">{level} × {w.toFixed(2)}</span>
                  ))}
                </div>

                <div className="cap mb8">4 · Evidence quality</div>
                <p className="small mb8">
                  Documents are classified from their type and file name. Quality scales the points
                  an obligation earns by a factor of {EVIDENCE_FLOOR.toFixed(2)} to 1.00 - weak
                  evidence shades the score rather than erasing the filing.
                </p>
                <div className="tw mb16">
                  <table className="dt">
                    <thead><tr><th>Evidence</th><th className="right">Quality</th></tr></thead>
                    <tbody>
                      {EVIDENCE_TIERS.map(t => (
                        <tr key={t.key}><td>{t.label}</td>
                          <td className="right num strong">{Math.round(t.quality * 100)}%</td></tr>
                      ))}
                      <tr><td className="muted">Unclassified document</td>
                        <td className="right num">{Math.round(EVIDENCE_UNCLASSIFIED * 100)}%</td></tr>
                    </tbody>
                  </table>
                </div>

                <dl className="kv mb16">
                  <dt>Applicable obligations</dt>
                  <dd>Every obligation due on or before today for the entities and financial year in
                    scope, excluding anything a reviewer has marked not applicable.</dd>
                  <dt>Evidence coverage</dt>
                  <dd>% of applicable obligations with at least one uploaded document, approved or not.</dd>
                  <dt>On-time filing rate</dt>
                  <dd>% of filed obligations filed on or before their due date.</dd>
                  <dt>Overdue and delay indicators</dt>
                  <dd>Still reported alongside the score. They are no longer subtracted from it -
                    lateness is already priced into the outcome points above, and deducting it twice
                    would charge for the same failure in two places.</dd>
                </dl>
                <p className="small muted">
                  An obligation only counts as fully approved once a reviewer has accepted its
                  evidence. Obligations not yet due are excluded entirely rather than counted against
                  the group. The month-on-month trend is reconstructed from historic approval dates
                  and remains a simple ratio, because the evidence as it stood on a past date is not
                  recoverable - the trend shows the shape of movement, the headline shows today&apos;s
                  weighted position.
                </p>
              </div>
            </div>
          )}

          {showGenericTable && err && <Note kind="b">{err}</Note>}
          {showGenericTable && loading && (
            <div className="card"><div className="card-b" style={{ display: 'grid', gap: 10 }}>
              {Array.from({ length: 8 }, (_, r) => (
                <div key={r} style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
                  {Array.from({ length: 6 }, (_, c) => (
                    <div key={c} className="skel skel-text" style={{ width: c === 0 ? '80%' : '60%' }} />
                  ))}
                </div>
              ))}
            </div></div>
          )}

          {showGenericTable && !loading && data && (
            <>
              {data.notStarted ? (
                <div className="card"><div className="empty">
                  <strong>{data.periodLabel ?? 'This period'} has not yet started.</strong><br />
                  There is nothing to report yet for a future period - check back once it is under way.
                </div></div>
              ) : data.rows.length === 0 ? (
                <div className="card"><div className="empty">
                  Nothing to report - there are no records matching this report in your scope.
                  For the overdue and delay reports that is good news.
                </div></div>
              ) : (
                <div className="card">
                  <div className="tw">
                    <table className="dt">
                      <thead><tr>{cols.map(c => (
                        <th key={c} className={isNumericCol(data.rows, c) ? 'center' : ''}>{c}</th>
                      ))}</tr></thead>
                      <tbody>
                        {data.rows.map((r, i) => (
                          <tr key={i}>
                            {cols.map(c => (
                              <td key={c} className={isNumericCol(data.rows, c) ? 'center' : ''}>
                                {cell(r[c], c)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {data.extraSheets?.map(s => (
                <div className="card mt16" key={s.name}>
                  <div className="card-h"><h3>{s.name}</h3>
                    <span className="tiny muted">{s.rows.length} rows</span></div>
                  <div className="tw">
                    <table className="dt">
                      <thead><tr>
                        {(s.rows[0] ? Object.keys(s.rows[0]) : []).map(c => (
                          <th key={c} className={isNumericCol(s.rows, c) ? 'center' : ''}>{c}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {s.rows.map((r, i) => (
                          <tr key={i}>
                            {Object.keys(r).map(c => (
                              <td key={c} className={isNumericCol(s.rows, c) ? 'center' : ''}>
                                {cell(r[c], c)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* useSearchParams needs a Suspense boundary so the shell can render immediately
   instead of the whole route opting out of static rendering. */
export default function ReportsPage() {
  return (
    <Suspense fallback={<Spinner label="Preparing reports…" />}>
      <ReportsInner />
    </Suspense>
  );
}
