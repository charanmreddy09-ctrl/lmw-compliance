'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Ic, Modal, Note, Spinner, StatusPill, DataTable, ValidationChecks, type Col,
  fmtDate, fmtDateTime, fmtBytes, daysFromToday, RISK_TONE, useToast, downloadFile, Kpi,
  Lifecycle, scoreColor,
} from '@/components/ui';

type QRow = {
  id: string; reference: string; period_label: string; due_date: string;
  filed_date: string | null; status: string; delay_days: number;
  penalty_exposure: string | null; workflow_stage: string;
  code: string; title: string; form_reference: string | null; risk_level: string;
  penalty: string | null; evidence_required: string[]; category: string;
  entity_id: string; entity: string; country_code: string;
  preparer: string | null; reviewer: string | null; files: string;
  validation: { outcome?: string; checks?: { key: string; label: string; result: string; detail: string }[] } | null;
  submitted_at: string | null;
};
type EvFile = {
  id: string; file_name: string; mime_type: string; size_bytes: string; version: number;
  doc_type: string | null; filed_date: string | null; status: string;
  validation: QRow['validation']; uploaded_at: string; uploaded_by_name: string | null;
};
type Trail = {
  id: number; action: string; comment: string | null; from_status: string | null;
  to_status: string | null; created_at: string; actor: string | null; actor_role: string | null;
};
/** B8 — the signed-in reviewer's own record over a rolling 90 days. */
type Stats = {
  decisions: number; approved: number; queried: number; rejected: number;
  avgHours: number | null; slaRate: number | null; measured: number;
};

const ACTIONS: { id: string; label: string; cls: string; icon: string; needsComment: boolean; hint: string }[] = [
  { id: 'approve', label: 'Approve', cls: 'btn-ok', icon: 'check2', needsComment: false,
    hint: 'Confirms the evidence supports the filing. Only approved obligations count towards the compliance score.' },
  { id: 'query', label: 'Raise query', cls: 'btn-warn', icon: 'alert', needsComment: true,
    hint: 'Returns the item to the preparer with your question. It stays open until they resubmit.' },
  { id: 'reject', label: 'Reject', cls: 'btn-bad', icon: 'x', needsComment: true,
    hint: 'Rejects the submission outright. The preparer must file again from the start.' },
  { id: 'escalate', label: 'Escalate', cls: '', icon: 'arrowR', needsComment: true,
    hint: 'Refers the item to the country head and the CFO’s office without closing it.' },
];

function ReviewsInner() {
  const search = useSearchParams();
  const toast = useToast();
  const [rows, setRows] = useState<QRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState('pending');
  const [entity, setEntity] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(search.get('obligation'));
  const [escRunning, setEscRunning] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [slaHours, setSlaHours] = useState(48);

  async function runEscalations() {
    setEscRunning(true);
    try {
      const res = await fetch('/api/escalations/run', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast(
        `Escalation check complete — ${j.reminders} reminder${j.reminders === 1 ? '' : 's'}, `
        + `${j.deptHead} to department head, ${j.cfo} to the CFO, ${j.auditCommittee} to the Audit Committee.`,
        'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The escalation check could not run.', 'bad');
    } finally { setEscRunning(false); }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reviews');
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Unable to load the review queue.');
      setRows(d.queue);
      setStats(d.stats ?? null);
      setSlaHours(d.slaHours ?? 48);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to load the review queue.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Auto-sync: a preparer's submission from a different session shows up
     here without needing a manual reload — matches the dashboard's and the
     compliance library's own polling pattern. */
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const entities = useMemo(
    () => [...new Map(rows.map(r => [r.entity_id, r.entity])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [rows]);

  const buckets = useMemo(() => ({
    pending: rows.filter(r => r.status === 'Submitted' || r.status === 'Under Review'),
    queried: rows.filter(r => r.status === 'Query Raised'),
    rejected: rows.filter(r => r.status === 'Rejected'),
  }), [rows]);

  const active = (buckets as Record<string, QRow[]>)[tab] ?? [];
  const shown = active.filter(r =>
    (!entity || r.entity_id === entity) &&
    (!q || `${r.title} ${r.code} ${r.entity} ${r.form_reference ?? ''}`.toLowerCase().includes(q.toLowerCase())));

  const flagged = buckets.pending.filter(r => r.validation?.outcome && r.validation.outcome !== 'clean').length;
  const late = buckets.pending.filter(r => r.delay_days > 0).length;

  const cols: Col<QRow & Record<string, unknown>>[] = [
    { key: 'submitted_at', label: 'Submitted', sort: true, cls: 'nowrap',
      render: r => (<><div className="num">{fmtDate(r.submitted_at)}</div>
        <div className="t2">{r.period_label}</div></>) },
    { key: 'title', label: 'Compliance', sort: true, cls: 'w',
      render: r => (<><div className="t1">{r.title}</div>
        <div className="t2">{r.code} · {r.category}{r.form_reference ? ` · ${r.form_reference}` : ''}</div></>) },
    { key: 'entity', label: 'Entity', sort: true, cls: 'nowrap small',
      render: r => (<><div className="t1">{r.entity}</div><div className="t2">{r.country_code}</div></>) },
    { key: 'preparer', label: 'Filed by', sort: true, cls: 'small nowrap',
      render: r => r.preparer ?? <span className="dim">—</span> },
    { key: 'due_date', label: 'Due', sort: true, cls: 'nowrap num',
      render: r => (<>{fmtDate(r.due_date)}
        {r.delay_days > 0 && <div className="t2" style={{ color: 'var(--bad-600)' }}>+{r.delay_days} d late</div>}</>) },
    { key: 'validation', label: 'Auto checks', sort: true,
      value: r => r.validation?.outcome ?? 'none',
      render: r => {
        const o = r.validation?.outcome;
        if (!o) return <span className="dim">—</span>;
        return <span className={`pill ${o === 'clean' ? 'p-ok' : o === 'blocked' ? 'p-bad' : 'p-warn'}`}>{o}</span>;
      } },
    { key: 'risk_level', label: 'Risk', sort: true,
      render: r => <span className={`pill ${RISK_TONE[r.risk_level] ?? 'p-mute'}`}>{r.risk_level}</span> },
    { key: 'status', label: 'Status', sort: true, render: r => <StatusPill s={r.status} /> },
  ];

  if (err) return <Note kind="b">{err}</Note>;

  return (
    <>
      <div className="card mb16">
        <div className="card-h">
          <div>
            <h3>Escalation matrix</h3>
            <span className="tiny muted">
              Runs automatically once a day. Reminder at 15 days before due, escalation to the
              department head at 7 days, to the CFO once overdue, and to the Audit Committee for
              significant non-compliance (14+ days overdue, or any delay on a Critical/High risk item).
            </span>
          </div>
          <button className="btn btn-s no-print" onClick={runEscalations} disabled={escRunning}>
            <Ic n="swap" s={13} /> {escRunning ? 'Checking…' : 'Run check now'}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- B8
          Your own record, not the queue's. The queue says what is left to do;
          this says how you have been doing it. Measured from the submission
          that put each item in front of you to the decision you took, over a
          rolling 90 days — so a query-and-resubmit counts as two reviews
          rather than one very slow one. */}
      {stats && stats.decisions > 0 && (
        <div className="card mb16">
          <div className="card-h">
            <div>
              <h3>Your review record</h3>
              <span className="tiny muted">Last 90 days · target turnaround {slaHours} hours</span>
            </div>
          </div>
          <div className="card-b row g24 wrap">
            <div>
              <div className="tiny dim">Decisions taken</div>
              <div className="num strong" style={{ fontSize: 22, lineHeight: 1.1 }}>{stats.decisions}</div>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--line-2)' }} />
            <div>
              <div className="tiny dim">Average turnaround</div>
              <div className="num strong" style={{ fontSize: 22, lineHeight: 1.1 }}>
                {stats.avgHours == null ? '—' : <>{stats.avgHours}<span style={{ fontSize: 13, fontFamily: 'var(--font-sans)', marginLeft: 2 }}>h</span></>}
              </div>
            </div>
            <div>
              <div className="tiny dim">Within {slaHours}h</div>
              <div className="num strong" style={{
                fontSize: 22, lineHeight: 1.1,
                color: stats.slaRate == null ? undefined : scoreColor(stats.slaRate),
              }}>
                {stats.slaRate == null ? '—' : <>{stats.slaRate}<span style={{ fontSize: 13, fontFamily: 'var(--font-sans)' }}>%</span></>}
              </div>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--line-2)' }} />
            <div>
              <div className="tiny dim">Approved</div>
              <div className="num strong" style={{ fontSize: 17, color: 'var(--ok-700)' }}>{stats.approved}</div>
            </div>
            <div>
              <div className="tiny dim">Queried</div>
              <div className="num strong" style={{ fontSize: 17, color: 'var(--warn-700)' }}>{stats.queried}</div>
            </div>
            <div>
              <div className="tiny dim">Rejected</div>
              <div className="num strong" style={{ fontSize: 17, color: 'var(--bad-600)' }}>{stats.rejected}</div>
            </div>
            {stats.measured < stats.decisions && (
              <div className="grow tiny dim" style={{ alignSelf: 'flex-end', textAlign: 'right', minWidth: 160 }}>
                {stats.decisions - stats.measured} decision{stats.decisions - stats.measured === 1 ? '' : 's'} had no
                matching submission on record and are excluded from the timing figures.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid g-4 mb16">
        <Kpi label="Awaiting your review" value={buckets.pending.length}
             sub="Submitted with evidence" barColor="var(--navy-600)"
             bar={rows.length ? (buckets.pending.length / rows.length) * 100 : 0} />
        <Kpi label="Flagged by validation" value={flagged}
             sub="Warnings or blocking issues" barColor="var(--warn-600)"
             bar={buckets.pending.length ? (flagged / buckets.pending.length) * 100 : 0} />
        <Kpi label="Filed late" value={late} sub="Delay already recorded" barColor="var(--bad-600)"
             bar={buckets.pending.length ? (late / buckets.pending.length) * 100 : 0} />
        <Kpi label="Open with preparers" value={buckets.queried.length + buckets.rejected.length}
             sub="Queried or rejected" barColor="var(--warn-600)"
             bar={rows.length ? ((buckets.queried.length + buckets.rejected.length) / rows.length) * 100 : 0} />
      </div>

      <div className="tabs no-print">
        {[
          { id: 'pending', label: `Pending review (${buckets.pending.length})` },
          { id: 'queried', label: `Query raised (${buckets.queried.length})` },
          { id: 'rejected', label: `Rejected (${buckets.rejected.length})` },
        ].map(t => (
          <button key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      <div className="card">
        <div className="card-h">
          <div className="row g8 wrap no-print">
            <select value={entity} onChange={e => setEntity(e.target.value)}>
              <option value="">All entities</option>
              {entities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <div className="search">
              <Ic n="search" s={14} />
              <input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
            </div>
          </div>
          <div className="row g8">
            <span className="small muted">{shown.length} items</span>
            <button className="btn btn-s no-print" onClick={load} disabled={loading}>
              <Ic n="swap" s={13} /> Refresh
            </button>
          </div>
        </div>
        {loading
          ? <div className="card-b"><Spinner label="Loading the review queue…" /></div>
          : <DataTable<QRow & Record<string, unknown>>
              rows={shown as (QRow & Record<string, unknown>)[]}
              cols={cols} rowKey={r => r.id} pageSize={30}
              onRow={r => setOpenId(r.id)}
              empty={tab === 'pending'
                ? 'Nothing is waiting for review. Everything submitted has been dealt with.'
                : 'Nothing in this bucket.'} />}
      </div>

      {openId && (
        <ReviewDrawer id={openId} onClose={() => setOpenId(null)} onDone={() => { setOpenId(null); load(); }} />
      )}
    </>
  );
}

/* ========================================================================= */
function ReviewDrawer({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<{
    obligation: Record<string, unknown>; files: EvFile[]; trail: Trail[];
    changes: { old_due_date: string; new_due_date: string; reason: string | null; changed_at: string; source: string | null }[];
  } | null>(null);
  const [pane, setPane] = useState<'detail' | 'evidence' | 'timeline'>('detail');
  const [err, setErr] = useState<string | null>(null);
  const [action, setAction] = useState<string>('approve');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/obligations/${id}`);
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? 'Unable to open this item.');
        setD(j);
      } catch (e) { setErr(e instanceof Error ? e.message : 'Unable to open this item.'); }
    })();
  }, [id]);

  const chosen = ACTIONS.find(a => a.id === action)!;

  async function submit() {
    if (busy) return;
    if (chosen.needsComment && !comment.trim()) {
      toast('This action needs a comment so the preparer knows what to do.', 'warn');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ obligationId: id, action, comment }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast(
        action === 'approve' ? 'Approved. The obligation now counts towards the compliance score.'
        : action === 'query' ? 'Query raised and returned to the preparer.'
        : action === 'reject' ? 'Rejected and returned for correction.'
        : 'Escalated to the country head and the CFO’s office.',
        action === 'approve' ? 'ok' : 'warn'
      );
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'The action could not be recorded.', 'bad');
      setBusy(false);
    }
  }

  if (err) return <Modal title="Review" onClose={onClose}><Note kind="b">{err}</Note></Modal>;
  if (!d) return <Modal title="Loading…" onClose={onClose}><Spinner /></Modal>;

  const o = d.obligation as Record<string, string | number | string[] | null>;
  const latest = d.files.find(f => f.status !== 'Superseded') ?? d.files[0];
  const overdue = daysFromToday(String(o.due_date));

  return (
    <Modal size="xw" sub={`${o.entity} · ${o.reference}`} title={String(o.title)} onClose={onClose}
           footer={
             <>
               <div className="grow tiny muted" style={{ textAlign: 'left', alignSelf: 'center' }}>{chosen.hint}</div>
               <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
               <button className={`btn ${chosen.cls || 'btn-p'}`} onClick={submit} disabled={busy}>
                 <Ic n={chosen.icon} s={13} /> {busy ? 'Recording…' : chosen.label}
               </button>
             </>
           }>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div className="row g8 wrap mb12">
            <StatusPill s={String(o.status)} />
            <span className={`pill ${RISK_TONE[String(o.risk_level)] ?? 'p-mute'}`}>{String(o.risk_level)} risk</span>
            <span className="pill p-mute nd">{String(o.period_label)}</span>
            {Number(o.delay_days) > 0 && <span className="pill p-bad">Filed {o.delay_days} d late</span>}
          </div>

          {latest?.validation?.outcome && latest.validation.outcome !== 'clean' && (
            <div className="mb12">
              <Note kind={latest.validation.outcome === 'blocked' ? 'b' : 'w'}>
                <strong>Automatic validation returned {latest.validation.outcome}.</strong>{' '}
                Review the checks below before deciding.
              </Note>
            </div>
          )}
          {Number(o.delay_days) > 0 && o.penalty && (
            <div className="mb12"><Note kind="w">
              <strong>Penalty exposure.</strong> {String(o.penalty)}
            </Note></div>
          )}

          {/* ----------------------------------------------------- B10 / B11
              A workspace rather than one long scroll: the record, the
              documents and the full lifecycle are separate panes, while the
              decision controls opposite stay visible throughout — a reviewer
              never has to navigate away from what they are deciding in order
              to see why. */}
          <div className="tabs no-print" style={{ marginBottom: 12 }}>
            {([
              ['detail', 'Overview'],
              ['evidence', `Evidence (${d.files.length})`],
              ['timeline', `Timeline (${d.trail.length})`],
            ] as const).map(([id, label]) => (
              <button key={id} className={`tab${pane === id ? ' on' : ''}`}
                      onClick={() => setPane(id)}>{label}</button>
            ))}
          </div>

          {pane === 'detail' && (
            <dl className="kv mb16">
              <dt>Entity</dt><dd>{String(o.entity_name)} · {String(o.country_name)}</dd>
              <dt>Category</dt><dd>{String(o.category)}</dd>
              <dt>Applicable law</dt><dd>{o.applicable_law ? String(o.applicable_law) : '—'}</dd>
              <dt>Form / reference</dt><dd>{o.form_reference ? String(o.form_reference) : '—'}</dd>
              <dt>Due date</dt>
              <dd className="num strong">{fmtDate(String(o.due_date))}
                {overdue != null && overdue < 0 && !o.filed_date && (
                  <span style={{ color: 'var(--bad-600)' }}> · {-overdue} d overdue</span>
                )}</dd>
              <dt>Date of filing</dt><dd className="num">{fmtDate(o.filed_date ? String(o.filed_date) : null)}</dd>
              <dt>Filed by</dt><dd>{o.assigned_to_name ? String(o.assigned_to_name) : '—'}</dd>
              <dt>Assigned reviewer</dt><dd>{o.reviewer_name ? String(o.reviewer_name) : '—'}</dd>
            </dl>
          )}

          {pane === 'evidence' && (
            <>
              {d.files.length === 0 && (
                <Note kind="b">No document is attached. Do not approve — raise a query asking the
                  preparer to upload the filed return.</Note>
              )}
              {d.files.map(f => (
                <div key={f.id} className="row between g8 wrap"
                     style={{ padding: '8px 0', borderBottom: '1px solid var(--line-2)' }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="row g6">
                      <Ic n="doc" s={13} />
                      <span className="small strong" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.file_name}</span>
                      {f.status === 'Superseded' && <span className="pill p-mute nd tiny">superseded</span>}
                    </div>
                    <div className="tiny muted mt4">
                      v{f.version} · {fmtBytes(Number(f.size_bytes))} · {f.doc_type ?? 'Unclassified'} ·
                      {' '}uploaded {fmtDateTime(f.uploaded_at)} by {f.uploaded_by_name ?? 'unknown'}
                    </div>
                  </div>
                  <div className="row g6">
                    <a className="btn btn-xs" href={`/api/evidence/${f.id}`} target="_blank" rel="noopener noreferrer">
                      <Ic n="eye" s={12} /> View
                    </a>
                    <button className="btn btn-xs"
                            onClick={() => downloadFile(`/api/evidence/${f.id}?dl=1`, f.file_name, toast)}>
                      <Ic n="download" s={12} />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {pane === 'timeline' && (
            <>
              <Lifecycle trail={d.trail} />
              {d.changes.length > 0 && (
                <>
                  <div className="cap mb8 mt16">Due date changes</div>
                  {d.changes.map((c, i) => (
                    <div key={i} className="small" style={{ padding: '6px 0', borderBottom: '1px solid var(--line-2)' }}>
                      <span className="num">{fmtDate(c.old_due_date)}</span>
                      {' '}<Ic n="arrowR" s={11} />{' '}
                      <span className="num strong">{fmtDate(c.new_due_date)}</span>
                      {c.reason && <div className="tiny muted mt4">{c.reason}</div>}
                      <div className="tiny dim mt4">{fmtDateTime(c.changed_at)}{c.source ? ` · ${c.source}` : ''}</div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>

        <div>
          <div className="cap mb8">Automatic validation</div>
          <div className="card mb16"><div className="card-b">
            <ValidationChecks v={latest?.validation ?? null} />
          </div></div>

          <div className="cap mb8">Required evidence</div>
          <div className="mb16">
            {((o.evidence_required as string[]) ?? []).length === 0 && (
              <div className="small muted">Not specified in the library.</div>
            )}
            {((o.evidence_required as string[]) ?? []).map((r, i) => (
              <div className="small row g6" key={i} style={{ padding: '3px 0' }}>
                <Ic n="chevR" s={11} /> {r}
              </div>
            ))}
          </div>

          <div className="cap mb8">Your decision</div>
          <div className="row g6 wrap mb12">
            {ACTIONS.map(a => (
              <button key={a.id}
                      className={`btn btn-s${action === a.id ? ` ${a.cls || 'btn-p'}` : ''}`}
                      onClick={() => setAction(a.id)}>
                <Ic n={a.icon} s={12} /> {a.label}
              </button>
            ))}
          </div>

          <div className="f">
            <label htmlFor="rc">
              Comment {chosen.needsComment ? <span style={{ color: 'var(--bad-600)' }}>(required)</span> : '(optional)'}
            </label>
            <textarea id="rc" value={comment} onChange={e => setComment(e.target.value)}
                      placeholder={
                        action === 'query' ? 'What does the preparer need to correct or explain?'
                        : action === 'reject' ? 'Why is this submission being rejected?'
                        : action === 'escalate' ? 'Why does this need the country head’s attention?'
                        : 'Any note to record with the approval.'} />
          </div>

          {/* The last few events for context while deciding. The Timeline tab
              opposite carries the complete, audit-grade record. */}
          <div className="row between g8 mb8 mt16">
            <span className="cap">Recent history</span>
            {d.trail.length > 4 && pane !== 'timeline' && (
              <button className="btn btn-xs no-print" onClick={() => setPane('timeline')}>
                Full timeline
              </button>
            )}
          </div>
          <Lifecycle trail={d.trail} limit={4} />
        </div>
      </div>
    </Modal>
  );
}

/* useSearchParams needs a Suspense boundary so the shell can render immediately
   instead of the whole route opting out of static rendering. */
export default function ReviewsPage() {
  return (
    <Suspense fallback={<Spinner label="Loading the review queue…" />}>
      <ReviewsInner />
    </Suspense>
  );
}
