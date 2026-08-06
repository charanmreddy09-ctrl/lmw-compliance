'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Ic, Note, Spinner, scoreColor, downloadFile, useToast } from '@/components/ui';
import type { ScoreBreakdown } from '@/lib/score';

type Entity = {
  id: string; name: string; short_name: string; country_code: string; country_name: string;
  entity_type: string; city: string; currency: string; fy_end: string; employees: number;
  is_listed: boolean; has_factory: boolean; is_importer: boolean;
  statutory_auditor: string | null; local_advisor: string | null;
  division_name: string | null; jurisdiction_name: string | null;
  obligations: string; states: string | null;
};

export default function Entities() {
  const toast = useToast();
  const [rows, setRows] = useState<Entity[]>([]);
  const [scores, setScores] = useState<Record<string, ScoreBreakdown>>({});
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState('');
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/entities');
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? 'Unable to load entities.');
        setRows(d.entities);
        setScores(d.scores);
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Unable to load entities.');
      } finally { setLoading(false); }
    })();
  }, []);

  const countries = useMemo(
    () => [...new Set(rows.map(r => r.country_name))].sort(), [rows]);

  const shown = rows.filter(r =>
    (!country || r.country_name === country) &&
    (!q || `${r.name} ${r.short_name} ${r.city} ${r.entity_type} ${r.division_name ?? ''}`
      .toLowerCase().includes(q.toLowerCase())));

  if (err) return <Note kind="b">{err}</Note>;
  if (loading) return <Spinner label="Loading entities…" />;

  return (
    <>
      <div className="toolbar no-print">
        <select value={country} onChange={e => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="search">
          <Ic n="search" s={14} />
          <input placeholder="Search entity, city or division…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <span className="small muted">{shown.length} of {rows.length}</span>
        <div className="grow" />
        <button className="btn btn-s"
                onClick={() => downloadFile('/api/reports/entity?format=xlsx', 'entities.xlsx', toast)}>
          <Ic n="download" s={13} /> Export scorecards
        </button>
      </div>

      <div className="grid g-3">
        {shown.map(e => {
          const s = scores[e.id];
          const score = s?.score ?? 0;
          return (
            <Link key={e.id} href={`/entities/${e.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="card-h" style={{ alignItems: 'flex-start' }}>
                <div>
                  <h3>{e.short_name}</h3>
                  <div className="tiny muted mt4">{e.name}</div>
                </div>
                <div className="center" style={{ minWidth: 46 }}>
                  <div className="num strong" style={{ fontSize: 18, color: scoreColor(score), lineHeight: 1 }}>
                    {score.toFixed(1)}
                  </div>
                  <div className="tiny dim">score</div>
                </div>
              </div>
              <div className="card-b">
                <div className="row g6 wrap mb12">
                  <span className="pill p-mute nd">{e.country_name}</span>
                  {e.division_name && <span className="pill p-mute nd">{e.division_name}</span>}
                  {e.is_listed && <span className="pill p-info nd">Listed</span>}
                  {e.has_factory && <span className="pill p-mute nd">Factory</span>}
                  {e.is_importer && <span className="pill p-mute nd">Importer</span>}
                </div>

                <div className="bar mb12"><i style={{ width: `${score}%`, background: scoreColor(score) }} /></div>

                <div className="stack small">
                  <div><span className="k">Applicable obligations</span><span className="v num">{e.obligations}</span></div>
                  <div><span className="k">Approved with evidence</span><span className="v num">{s?.approved ?? 0}</span></div>
                  <div><span className="k">Overdue and unfiled</span>
                    <span className="v num" style={{ color: s?.overdue ? 'var(--bad-600)' : undefined }}>{s?.overdue ?? 0}</span></div>
                  <div><span className="k">Registered jurisdiction</span><span className="v small">{e.jurisdiction_name ?? '—'}</span></div>
                </div>

                {e.states && (
                  <div className="mt12">
                    <div className="cap mb4">Also operating in</div>
                    <div className="tiny muted">{e.states}</div>
                  </div>
                )}
                <div className="tiny muted mt12">{e.city} · {e.employees.toLocaleString()} employees · FY end {e.fy_end}</div>
              </div>
            </Link>
          );
        })}
      </div>
      {shown.length === 0 && <div className="card"><div className="empty">No entities match the current filters.</div></div>}
    </>
  );
}
