'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Ic, Note, Spinner, useToast, downloadFile, fmtDateTime, scoreColor } from '@/components/ui';

type Report = {
  type: string; title: string; rows: Record<string, unknown>[];
  extraSheets: { name: string; rows: Record<string, unknown>[] }[];
  generatedAt: string; generatedBy: string;
};

const REPORTS = [
  { id: 'executive', name: 'Executive summary', icon: 'report',
    d: 'The headline numbers for the Board: score, coverage, timeliness and exposure, with country and entity annexures.' },
  { id: 'country', name: 'Country compliance', icon: 'globe',
    d: 'Applicable versus followed for each country, with entity count, overdue items and score.' },
  { id: 'entity', name: 'Entity scorecard', icon: 'building',
    d: 'Every entity with its applicable obligations, approvals, coverage, on-time rate and score.' },
  { id: 'division', name: 'Division summary', icon: 'dash',
    d: 'Compliance position by operating division.' },
  { id: 'category', name: 'Category summary', icon: 'book',
    d: 'Where the group is strong and weak by type of compliance — tax, payroll, environmental and so on.' },
  { id: 'overdue', name: 'Overdue register', icon: 'alert',
    d: 'Every obligation past its due date with no evidence, ranked by how late it is, with penalty exposure.' },
  { id: 'delay', name: 'Delay analysis', icon: 'clock',
    d: 'Filings made after the due date, the delay in days and the penalty exposure recorded against each.' },
  { id: 'evidence', name: 'Evidence register', icon: 'doc',
    d: 'Full document inventory: what was uploaded, by whom, when, its version and validation outcome.' },
];

function ReportsInner() {
  const search = useSearchParams();
  const toast = useToast();
  const [active, setActive] = useState(search.get('r') ?? 'executive');
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (type: string) => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/reports/${type}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Unable to generate the report.');
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to generate the report.');
      setData(null);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(active); }, [active, load]);

  const meta = REPORTS.find(r => r.id === active);
  const cols = data?.rows.length ? Object.keys(data.rows[0]) : [];
  /* A column is numeric if every row's value for it is a number (or blank) —
     checked across all rows, not just the first, so a column doesn't end up
     with its header aligned one way and its body cells the other. Centred,
     not right-aligned, to match a scorecard's usual layout. */
  const isNumericCol = (rows: Record<string, unknown>[], key: string) =>
    rows.length > 0 && rows.every(r => typeof r[key] === 'number' || r[key] == null || r[key] === '');

  function cell(v: unknown, key: string) {
    if (v === null || v === undefined || v === '') return <span className="dim">—</span>;
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
          <div style={{ padding: '5px 0' }}>
            {REPORTS.map(r => (
              <button key={r.id} onClick={() => setActive(r.id)}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 9, width: '100%',
                        padding: '8px 13px', border: 'none', background: active === r.id ? 'var(--navy-050)' : 'none',
                        borderLeft: `2px solid ${active === r.id ? 'var(--navy-700)' : 'transparent'}`,
                        cursor: 'pointer', textAlign: 'left',
                      }}>
                <span style={{ marginTop: 1, color: active === r.id ? 'var(--navy-700)' : 'var(--ink-4)' }}>
                  <Ic n={r.icon} s={15} />
                </span>
                <span>
                  <span className="small strong" style={{ color: active === r.id ? 'var(--navy-800)' : 'var(--ink)' }}>
                    {r.name}
                  </span>
                </span>
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
                <h3>{meta?.name ?? 'Report'}</h3>
                <div className="tiny muted mt4">{meta?.d}</div>
              </div>
              <div className="row g6 no-print">
                <button className="btn btn-s" onClick={() => window.print()}>
                  <Ic n="doc" s={13} /> Print / PDF
                </button>
                <button className="btn btn-p btn-s"
                        onClick={() => downloadFile(`/api/reports/${active}?format=xlsx`,
                          `SGCMP_${active}.xlsx`, toast)}>
                  <Ic n="download" s={13} /> Excel
                </button>
              </div>
            </div>
            {data && (
              <div className="card-f row between wrap g8">
                <span className="tiny muted">
                  Generated {fmtDateTime(data.generatedAt)} by {data.generatedBy} ·
                  {' '}{data.rows.length} row{data.rows.length === 1 ? '' : 's'}
                </span>
                <span className="tiny muted">Global Compliance Management Platform</span>
              </div>
            )}
          </div>

          {err && <Note kind="b">{err}</Note>}
          {loading && <Spinner label="Generating the report…" />}

          {!loading && data && (
            <>
              {data.rows.length === 0 ? (
                <div className="card"><div className="empty">
                  Nothing to report — there are no records matching this report in your scope.
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
