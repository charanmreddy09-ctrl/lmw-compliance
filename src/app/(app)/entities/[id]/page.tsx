'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Ic, Kpi, Modal, Note, Spinner, StatusPill, DataTable, type Col,
  scoreColor, fmtDate, fmtDateTime, daysFromToday, RISK_TONE, useToast, downloadFile,
} from '@/components/ui';
import { ProgressRing, AnimatedNumber, BadgeV2, SkeletonCard } from '@/components/ui2';
import type { ScoreBreakdown } from '@/lib/score';
import type { SessionUser } from '@/lib/rbac';
import { NOT_APPLICABLE_REASONS } from '@/lib/constants';

type Entity = {
  id: string; name: string; short_name: string; country_code: string; country_name: string;
  entity_type: string; city: string; currency: string; fy_end: string; employees: number;
  is_listed: boolean; has_factory: boolean; is_importer: boolean;
  statutory_auditor: string | null; local_advisor: string | null;
  division_name: string | null; jurisdiction_name: string | null; parent_id: string | null;
};
type Obl = {
  id: string; reference: string; period_label: string; due_date: string;
  filed_date: string | null; status: string; delay_days: number;
  title: string; code: string; risk_level: string; frequency: string;
  form_reference: string | null; category: string; jurisdiction: string | null; files: string;
};
type Grp = { category: string; total: string; approved: string; overdue: string };
type Recent = { action: string; comment: string | null; created_at: string; actor: string | null; title: string };
type Change = { old_due_date: string; new_due_date: string; reason: string | null; changed_at: string; title: string | null };
type State = { id: string; name: string; level: string; code: string };

type Applic = {
  compliance_id: string; code: string; title: string; category: string;
  excluded: boolean; reason: string | null; excluded_at: string | null; excluded_by: string | null;
};
type Payload = {
  entity: Entity; score: ScoreBreakdown | null; states: State[];
  byCategory: Grp[]; byStatus: { status: string; n: string }[];
  obligations: Obl[]; recent: Recent[]; changes: Change[]; applicability: Applic[];
};

export default function EntityDetail() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState('register');
  const [status, setStatus] = useState('');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');

  const load = async () => {
    try {
      const res = await fetch(`/api/entities/${params.id}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Unable to load this entity.');
      setD(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to load this entity.');
    }
  };

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(j => setUser(j.user)).catch(() => setUser(null));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const canExclude = !!user?.permissions.includes('compliance.review');

  const [excludeTarget, setExcludeTarget] = useState<Applic | null>(null);
  const [exReason, setExReason] = useState('');
  const [exRemark, setExRemark] = useState('');
  const [exSaving, setExSaving] = useState(false);

  async function toggleExclusion(a: Applic) {
    if (!d) return;
    if (a.excluded) {
      if (!confirm(`Mark "${a.title}" applicable again for ${d.entity.short_name}? Its obligations re-enter the normal workflow.`)) return;
      try {
        const res = await fetch(`/api/compliance-exclusions?compliance_id=${a.compliance_id}&entity_id=${d.entity.id}`, { method: 'DELETE' });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error);
        toast(`Marked applicable again - ${j.affected} obligation${j.affected === 1 ? '' : 's'} reopened.`, 'ok');
        load();
      } catch (e) { toast(e instanceof Error ? e.message : 'Could not update.', 'bad'); }
    } else {
      setExReason(''); setExRemark(''); setExcludeTarget(a);
    }
  }

  async function confirmExcludeEntity() {
    if (!d || !excludeTarget || !exReason || exSaving) return;
    if (exReason === 'Others' && !exRemark.trim()) return;
    const finalReason = exRemark.trim() ? `${exReason}: ${exRemark.trim()}` : exReason;
    setExSaving(true);
    try {
      const res = await fetch('/api/compliance-exclusions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ compliance_id: excludeTarget.compliance_id, entity_id: d.entity.id, reason: finalReason }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast(`Marked not applicable - ${j.affected} obligation${j.affected === 1 ? '' : 's'} excluded from the count.`, 'ok');
      setExcludeTarget(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update.', 'bad');
    } finally { setExSaving(false); }
  }

  const cats = useMemo(() => (d ? [...new Set(d.obligations.map(o => o.category))].sort() : []), [d]);
  const statuses = useMemo(() => (d ? [...new Set(d.obligations.map(o => o.status))].sort() : []), [d]);

  const shown = useMemo(() => {
    if (!d) return [];
    return d.obligations.filter(o =>
      (!status || o.status === status) &&
      (!cat || o.category === cat) &&
      (!q || `${o.title} ${o.code} ${o.form_reference ?? ''} ${o.reference}`.toLowerCase().includes(q.toLowerCase())));
  }, [d, status, cat, q]);

  if (err) return <Note kind="b">{err}</Note>;
  if (!d) return (
    <>
      <SkeletonCard height={64} />
      <div className="mt16"><SkeletonCard height={220} /></div>
    </>
  );

  const e = d.entity;
  const s = d.score;
  const subStates = d.states.filter(x => x.level !== 'federal');
  const scoreInProgress = Math.max(0, (s?.total ?? 0) - (s?.approved ?? 0) - (s?.overdue ?? 0));
  const scoreSegments = [
    { key: 'approved', value: s?.approved ?? 0, color: 'var(--emerald-500)', label: 'Compliant' },
    { key: 'progress', value: scoreInProgress, color: 'var(--amber-500)', label: 'In progress' },
    { key: 'overdue', value: s?.overdue ?? 0, color: 'var(--coral-500)', label: 'Overdue' },
  ].filter(seg => seg.value > 0);

  const cols: Col<Obl & Record<string, unknown>>[] = [
    { key: 'due_date', label: 'Due', sort: true, cls: 'nowrap',
      render: r => {
        const n = daysFromToday(r.due_date);
        const late = r.status !== 'Approved' && !r.filed_date && n != null && n < 0;
        return (<><div className="num">{fmtDate(r.due_date)}</div>
          <div className="t2" style={{ color: late ? 'var(--bad-600)' : undefined }}>
            {late ? `${-(n as number)} d overdue` : r.period_label}
          </div></>);
      } },
    { key: 'title', label: 'Compliance', sort: true, cls: 'w',
      render: r => (<><div className="t1">{r.title}</div>
        <div className="t2">{r.code} · {r.category}{r.form_reference ? ` · ${r.form_reference}` : ''}
          {r.jurisdiction ? ` · ${r.jurisdiction}` : ''}</div></>) },
    { key: 'frequency', label: 'Frequency', sort: true, cls: 'small nowrap' },
    { key: 'risk_level', label: 'Risk', sort: true,
      render: r => <span className={`pill ${RISK_TONE[r.risk_level] ?? 'p-mute'}`}>{r.risk_level}</span> },
    { key: 'filed_date', label: 'Filed', sort: true, cls: 'nowrap num',
      render: r => (<>{fmtDate(r.filed_date)}
        {r.delay_days > 0 && <div className="t2" style={{ color: 'var(--bad-600)' }}>+{r.delay_days} d</div>}</>) },
    { key: 'files', label: 'Docs', sort: true, cls: 'right num',
      value: r => Number(r.files),
      render: r => Number(r.files) ? <span className="pill p-mute nd">{r.files}</span> : <span className="dim">-</span> },
    { key: 'status', label: 'Status', sort: true, render: r => <StatusPill s={r.status} /> },
  ];

  return (
    <>
      <div className="row between wrap g12 mb16">
        <div className="row g12">
          <Link href="/entities" className="iconbtn no-print" aria-label="Back to entities"><Ic n="back" s={17} /></Link>
          <div>
            <h1>{e.name}</h1>
            <div className="small muted mt4">
              {e.entity_type} · {e.city} · {e.country_name} · FY end {e.fy_end} · {e.currency}
            </div>
          </div>
        </div>
        <div className="row g6 no-print">
          <Link href={`/register?entity=${e.id}`} className="btn btn-s"><Ic n="list" s={13} /> Open register</Link>
          <button className="btn btn-s" onClick={() => window.print()}><Ic n="doc" s={13} /> Print scorecard</button>
        </div>
      </div>

      <div className="grid g-side mb16">
        <div className="card stagger-in stagger-1">
          <div className="card-h"><h3>Compliance score</h3>
            <span className="tiny muted">Approved, evidence-backed obligations only</span></div>
          <div className="card-b row g24 wrap">
            <ProgressRing value={s?.score ?? 0} size={104} strokeWidth={9} segments={scoreSegments}
              center={
                <>
                  <span className="num strong" style={{ fontSize: 22, color: scoreColor(s?.score ?? 0), lineHeight: 1 }}>
                    <AnimatedNumber value={s?.score ?? 0} decimals={1} />
                  </span>
                  <span className="tiny dim" style={{ marginTop: 2 }}>SCORE</span>
                </>
              } />
            <div className="grow" style={{ minWidth: 230 }}>
              <div className="stack">
                <div><span className="k">Applicable</span><span className="v num">{s?.total ?? 0}</span></div>
                <div><span className="k">Approved</span><span className="v num">{s?.approved ?? 0}</span></div>
                <div><span className="k">Awaiting reviewer</span><span className="v num">{(s?.submitted ?? 0) + (s?.underReview ?? 0)}</span></div>
                <div><span className="k">Query / rejected</span><span className="v num">{(s?.queryRaised ?? 0) + (s?.rejected ?? 0)}</span></div>
                <div><span className="k">Overdue and unfiled</span>
                  <span className="v num" style={{ color: s?.overdue ? 'var(--bad-600)' : undefined }}>{s?.overdue ?? 0}</span></div>
              </div>
            </div>
            <div style={{ minWidth: 190 }}>
              <div className="cap mb8">Entity profile</div>
              <div className="row g6 wrap mb12">
                {e.is_listed && <span className="pill p-info nd">Listed</span>}
                {e.has_factory && <span className="pill p-mute nd">Factory</span>}
                {e.is_importer && <span className="pill p-mute nd">Importer</span>}
                {e.division_name && <span className="pill p-mute nd">{e.division_name}</span>}
              </div>
              <div className="stack small">
                <div><span className="k">Employees</span><span className="v num">{e.employees.toLocaleString()}</span></div>
                <div><span className="k">Registered</span><span className="v small">{e.jurisdiction_name ?? '-'}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid stagger-in stagger-2" style={{ gridTemplateColumns: '1fr 1fr', alignContent: 'start' }}>
          <Kpi label="Evidence coverage" value={<><AnimatedNumber value={s?.evidenceCoverage ?? 0} decimals={1} /><span style={{ fontSize: 13 }}>%</span></>}
               sub="With a document" bar={s?.evidenceCoverage ?? 0} />
          <Kpi label="On-time filing" value={<><AnimatedNumber value={s?.onTimeRate ?? 0} decimals={1} /><span style={{ fontSize: 13 }}>%</span></>}
               sub="By the due date" bar={s?.onTimeRate ?? 0} />
          <Kpi label="Average delay" value={<><AnimatedNumber value={s?.avgDelayDays ?? 0} decimals={1} /><span style={{ fontSize: 13 }}> d</span></>}
               sub="Where late" bar={Math.min(100, (s?.avgDelayDays ?? 0) * 4)} barColor="var(--warn-600)" />
          <Kpi label="Filed late" value={<AnimatedNumber value={s?.filedLate ?? 0} />} sub="Historic count"
               bar={s?.total ? ((s.filedLate / s.total) * 100) : 0} barColor="var(--warn-600)" />
        </div>
      </div>

      {subStates.length > 0 && (
        <div className="mb16">
          <Note kind="i">
            <strong>State and provincial obligations apply to this entity.</strong>{' '}
            Registered in {subStates.map(x => x.name).join(', ')}. Only compliances attached to
            those jurisdictions appear in this register - adding or removing a registration in
            Administration changes the applicable list immediately.
          </Note>
        </div>
      )}

      <div className="tabs no-print stagger-in stagger-3">
        {[
          { id: 'register', label: `Obligation register (${d.obligations.length})` },
          { id: 'category', label: 'By category' },
          ...(canExclude ? [{ id: 'applicability', label: `Applicability (${d.applicability.filter(a => a.excluded).length} excluded)` }] : []),
          { id: 'activity', label: 'Activity' },
          { id: 'changes', label: `Due date changes (${d.changes.length})` },
          { id: 'profile', label: 'Profile' },
        ].map(t => (
          <button key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {tab === 'register' && (
        <div className="card">
          <div className="card-h">
            <div className="row g8 wrap no-print">
              <select value={status} onChange={ev => setStatus(ev.target.value)}>
                <option value="">All Status</option>
                {statuses.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <select value={cat} onChange={ev => setCat(ev.target.value)}>
                <option value="">All laws</option>
                {cats.map(x => <option key={x} value={x}>{x}</option>)}
              </select>
              <div className="search">
                <Ic n="search" s={14} />
                <input placeholder="Search…" value={q} onChange={ev => setQ(ev.target.value)} />
              </div>
            </div>
            <span className="small muted">{shown.length} of {d.obligations.length}</span>
          </div>
          <DataTable<Obl & Record<string, unknown>>
            rows={shown as (Obl & Record<string, unknown>)[]}
            cols={cols} rowKey={r => r.id} pageSize={40}
            onRow={r => { window.location.href = `/register?obligation=${r.id}`; }}
          />
        </div>
      )}

      {tab === 'category' && (
        <div className="card">
          <div className="card-h"><h3>Compliance by law</h3>
            <button className="btn btn-s no-print"
                    onClick={() => downloadFile('/api/reports/category?format=xlsx', 'category.xlsx', toast)}>
              <Ic n="download" s={13} /> Export</button>
          </div>
          <div className="tw">
            <table className="dt">
              <thead><tr><th>Law</th><th className="right">Applicable</th><th className="right">Approved</th>
                <th className="right">Overdue</th><th style={{ width: 180 }}>Followed</th></tr></thead>
              <tbody>
                {d.byCategory.map(r => {
                  const t = Number(r.total), a = Number(r.approved);
                  const pct = t ? Math.round((a / t) * 1000) / 10 : 0;
                  return (
                    <tr key={r.category}>
                      <td className="t1">{r.category}</td>
                      <td className="right num">{t}</td>
                      <td className="right num">{a}</td>
                      <td className="right num" style={{ color: Number(r.overdue) ? 'var(--bad-600)' : undefined }}>{r.overdue}</td>
                      <td>
                        <div className="row g8">
                          <span className="num strong" style={{ color: scoreColor(pct), minWidth: 36 }}>{pct}%</span>
                          <span className="bar grow" style={{ marginTop: 0 }}>
                            <i style={{ width: `${pct}%`, background: scoreColor(pct) }} />
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

      {tab === 'applicability' && canExclude && (
        <div className="card">
          <div className="card-h">
            <h3>Compliance applicability</h3>
            <span className="tiny muted">Mark a compliance not applicable to remove it and its obligations from this entity's counts</span>
          </div>
          <div className="tw">
            <table className="dt">
              <thead><tr><th>Compliance</th><th>Law</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {d.applicability.map(a => (
                  <tr key={a.compliance_id}>
                    <td><div className="t1">{a.title}</div><div className="t2 mono">{a.code}</div></td>
                    <td className="small">{a.category}</td>
                    <td>
                      {a.excluded
                        ? <span className="pill p-mute" title={`${a.excluded_by ?? ''} ${a.excluded_at ? fmtDate(a.excluded_at) : ''}`}>
                            Not applicable{a.reason ? ` - ${a.reason}` : ''}
                          </span>
                        : <span className="pill p-ok nd">Applicable</span>}
                    </td>
                    <td className="nowrap no-print">
                      <button className="btn btn-xs" onClick={() => toggleExclusion(a)}>
                        {a.excluded ? 'Mark applicable' : 'Mark not applicable'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="card"><div className="card-b">
          {d.recent.length === 0 && <div className="empty">No activity recorded for this entity yet.</div>}
          <div className="tl">
            {d.recent.map((a, i) => (
              <div className={`tl-i ${a.action === 'approve' ? 'ok' : a.action === 'reject' ? 'bad' : a.action === 'query' ? 'warn' : ''}`} key={i}>
                <div className="tl-t"><strong>{a.actor ?? 'System'}</strong> - {a.action} - {a.title}</div>
                {a.comment && <div className="small muted mt4">{a.comment}</div>}
                <div className="tl-m mt4">{fmtDateTime(a.created_at)}</div>
              </div>
            ))}
          </div>
        </div></div>
      )}

      {tab === 'changes' && (
        <div className="card">
          <div className="tw">
            <table className="dt">
              <thead><tr><th>Compliance</th><th>Previous due</th><th>Revised due</th><th>Reason</th><th>Recorded</th></tr></thead>
              <tbody>
                {d.changes.length === 0 && (
                  <tr><td colSpan={5}><div className="empty">No due date changes recorded for this entity.</div></td></tr>
                )}
                {d.changes.map((c, i) => (
                  <tr key={i}>
                    <td className="t1 w">{c.title ?? '-'}</td>
                    <td className="num nowrap">{fmtDate(c.old_due_date)}</td>
                    <td className="num nowrap strong">{fmtDate(c.new_due_date)}</td>
                    <td className="small w">{c.reason ?? '-'}</td>
                    <td className="small nowrap">{fmtDateTime(c.changed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'profile' && (
        <div className="grid g-2">
          <div className="card">
            <div className="card-h"><h3>Statutory profile</h3></div>
            <div className="card-b">
              <dl className="kv">
                <dt>Entity ID</dt><dd className="mono">{e.id}</dd>
                <dt>Legal name</dt><dd>{e.name}</dd>
                <dt>Type</dt><dd>{e.entity_type}</dd>
                <dt>Country</dt><dd>{e.country_name}</dd>
                <dt>Registered jurisdiction</dt><dd>{e.jurisdiction_name ?? '-'}</dd>
                <dt>Division</dt><dd>{e.division_name ?? '-'}</dd>
                <dt>Location</dt><dd>{e.city}</dd>
                <dt>Reporting currency</dt><dd>{e.currency}</dd>
                <dt>Financial year end</dt><dd>{e.fy_end}</dd>
                <dt>Employees</dt><dd className="num">{e.employees.toLocaleString()}</dd>
                <dt>Statutory auditor</dt><dd>{e.statutory_auditor ?? '-'}</dd>
                <dt>Local adviser</dt><dd>{e.local_advisor ?? '-'}</dd>
                <dt>Parent</dt><dd>{e.parent_id ?? 'None - group parent'}</dd>
              </dl>
            </div>
          </div>
          <div className="card">
            <div className="card-h"><h3>Registered jurisdictions</h3>
              <span className="tiny muted">Drives applicability</span></div>
            <div className="tw">
              <table className="dt">
                <thead><tr><th>Jurisdiction</th><th>Level</th><th>Code</th></tr></thead>
                <tbody>
                  {d.states.map(x => (
                    <tr key={x.id}>
                      <td className="t1">{x.name}</td>
                      <td><span className="pill p-mute nd">{x.level}</span></td>
                      <td className="mono small">{x.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card-f tiny muted">
              A compliance attached to a jurisdiction listed here becomes applicable to this
              entity automatically. Manage registrations in Administration → Entities.
            </div>
          </div>
        </div>
      )}

      {excludeTarget && (
        <Modal title="Mark not applicable" sub={excludeTarget.title} onClose={() => setExcludeTarget(null)}
               footer={<>
                 <button className="btn" onClick={() => setExcludeTarget(null)} disabled={exSaving}>Cancel</button>
                 <button className="btn btn-p" onClick={confirmExcludeEntity}
                         disabled={exSaving || !exReason || (exReason === 'Others' && !exRemark.trim())}>
                   {exSaving ? 'Saving…' : 'Mark not applicable'}
                 </button>
               </>}>
          <div className="f">
            <label htmlFor="exr2">Reason <span style={{ color: 'var(--bad-600)' }}>(required)</span></label>
            <select id="exr2" value={exReason} onChange={e => setExReason(e.target.value)}>
              <option value="">Select…</option>
              {NOT_APPLICABLE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="f">
            <label htmlFor="exm2">
              Remark {exReason === 'Others' ? <span style={{ color: 'var(--bad-600)' }}>(required)</span> : '(optional)'}
            </label>
            <textarea id="exm2" value={exRemark} onChange={e => setExRemark(e.target.value)}
                      placeholder={exReason === 'Others' ? 'Describe why this does not apply.' : 'Any further detail (optional).'} />
          </div>
        </Modal>
      )}
    </>
  );
}
