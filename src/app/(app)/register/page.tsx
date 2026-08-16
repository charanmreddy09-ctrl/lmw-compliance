'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Ic, Modal, Note, Spinner, StatusPill, DataTable, ValidationChecks, type Col,
  fmtDate, fmtDateTime, fmtBytes, daysFromToday, RISK_TONE, useToast, downloadFile,
} from '@/components/ui';
import { Stepper, BadgeV2, LawTrivia, type StepperStep } from '@/components/ui2';
import type { SessionUser } from '@/lib/rbac';
import { fyStartYearOf, fyLabel, today } from '@/lib/dates';
import { MIN_REMARK_LENGTH } from '@/lib/constants';

/** Parses a DATE-only or full-timestamp string the same safe way as
    daysFromToday — a bare "2026-08-10" is midnight UTC, not local midnight. */
function parseDateSafe(v: string): Date {
  return new Date(v.length === 10 ? v + 'T00:00:00Z' : v);
}

type Obl = {
  id: string; reference: string; period_label: string; due_date: string; fy_start_year: number;
  original_due_date: string | null; filed_date: string | null; status: string;
  workflow_stage: string; delay_days: number; penalty_exposure: string | null; notes: string | null;
  compliance_id: string; code: string; title: string; applicable_law: string | null;
  form_reference: string | null; authority: string | null; frequency: string;
  risk_level: string; evidence_required: string[]; penalty: string | null;
  government_site: string | null; category_id: string; category: string;
  jurisdiction: string | null; jurisdiction_level: string | null;
  entity_id: string; entity: string; entity_name: string; country_code: string; country_name: string;
  assigned_to_name: string | null; assigned_to: string | null;
  reviewer_name: string | null; reviewer_id: string | null;
  files: string; last_upload: string | null;
};
type EvFile = {
  id: string; file_name: string; mime_type: string; size_bytes: string; version: number;
  doc_type: string | null; period_label: string | null; filed_date: string | null;
  status: string; validation: { outcome?: string; checks?: { key: string; label: string; result: string; detail: string }[] } | null;
  is_nil: boolean; uploaded_at: string; reviewed_at: string | null;
  uploaded_by_name: string | null; reviewed_by_name: string | null;
};
/** Computed penalty exposure as /api/obligations/[id] returns it. */
type PenaltyView = {
  total: number | null;
  currency: string | null;
  delayDays: number;
  components: { key: string; label: string; amount: number; detail: string }[];
  needsBase: boolean;
  baseLabel: string | null;
  note: string;
};
type Trail = {
  id: number; action: string; comment: string | null; from_status: string | null;
  to_status: string | null; created_at: string; actor: string | null; actor_role: string | null;
  target_user: string | null;
};

/* Pure visual derivation of the lifecycle stepper from the existing status/
   workflow_stage fields - no schema change, no new data. */
function deriveStepperState(o: Obl): StepperStep[] {
  const s = o.status;
  const w = o.workflow_stage;
  const prepared = ['Submitted', 'Under Review', 'Query Raised', 'Approved', 'Rejected'].includes(s) || !!o.filed_date;
  const preparedActive = ['Not Started', 'Evidence Pending'].includes(s) && w === 'preparer';
  const reviewed = s === 'Approved' || w === 'country_head' || w === 'closed' || s === 'Rejected';
  const reviewedActive = w === 'reviewer';
  const approved = s === 'Approved' && w === 'closed';
  const approvedActive = w === 'country_head';
  return [
    { id: 'created', label: 'Created', state: 'done' },
    { id: 'assigned', label: 'Assigned', state: o.assigned_to ? 'done' : 'pending' },
    { id: 'prepared', label: 'Prepared', state: prepared ? 'done' : preparedActive ? 'active' : 'pending' },
    {
      id: 'reviewed', label: 'Reviewed',
      state: reviewed ? 'done' : (reviewedActive || s === 'Query Raised') ? 'active' : 'pending',
      tone: s === 'Rejected' ? 'bad' : undefined,
      caption: s === 'Query Raised' ? 'Query raised' : undefined,
    },
    { id: 'approved', label: 'Approved', state: approved ? 'done' : approvedActive ? 'active' : 'pending' },
  ];
}

function RegisterInner() {
  const search = useSearchParams();
  const toast = useToast();

  const [user, setUser] = useState<SessionUser | null>(null);
  const [rows, setRows] = useState<Obl[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [entity, setEntity] = useState(search.get('entity') ?? '');
  /* Deep-linked from a dashboard tile's count (e.g. "Pending reviews" ->
     Submitted,Under Review) - comma-separated so a tile that aggregates more
     than one status can still land on the exact same set of rows. */
  const [status, setStatus] = useState(search.get('status') ?? '');
  const [cat, setCat] = useState('');
  /* Deep-linked from the dashboard's Immediate attention panel and the
     Critical risks tile, so a count there goes straight to the obligations
     behind it. Comma-separated for the same reason as status above. */
  const [risk, setRisk] = useState(search.get('risk') ?? '');
  const statusList = useMemo(() => status ? status.split(',') : [], [status]);
  const riskList = useMemo(() => risk ? risk.split(',') : [], [risk]);
  /* The panel's count is not "every obligation at this risk level" — it's
     specifically open exposure: due and not yet approved. Carrying that
     same condition here keeps the number the CFO clicked and the list they
     land on in agreement instead of the drill-through silently widening
     into the full register. */
  const attentionOnly = search.get('attention') === '1';
  /* attention=1 (the Immediate attention panel, and the Critical risks tile
     which reuses it) is itself counted per financial year server side, so
     the deep link carries fy too and the register's month-vs-year toggle
     is bypassed in favour of that exact year - not bypassed entirely,
     which used to let a prior FY's backlog inflate the drill-through past
     the number that was actually clicked. */
  const deepLinked = attentionOnly;
  const [q, setQ] = useState('');
  /* The register opens on the current month, not the whole year's filing
     calendar dumped in one list — "Full year" is a deliberate switch, not
     the default, with the financial year defaulting to the current one.
     A deep link that names a financial year (e.g. "Pending reviews", which
     the dashboard counts per FY) opens straight into that year instead. */
  const fyParam = search.get('fy');
  const [viewScope, setViewScope] = useState<'month' | 'year'>(fyParam ? 'year' : 'month');
  const [fy, setFy] = useState<number>(fyParam ? Number(fyParam) : fyStartYearOf(today()));

  const [openId, setOpenId] = useState<string | null>(search.get('obligation'));

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      /* Every obligation the user can see, in one request - the register
         filters/sorts/counts entirely client-side. The API orders by
         due_date DESC, so a limit smaller than the tenant's true total
         silently drops the OLDEST rows (the ones actually due or overdue) -
         exactly the ones "needs attention" filters and counts depend on.
         20000 comfortably covers a multi-country, multi-year register. */
      const res = await fetch('/api/obligations?limit=20000');
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Unable to load the register.');
      setRows(d.obligations);
      setErr(null);
    } catch (e) {
      if (!silent) setErr(e instanceof Error ? e.message : 'Unable to load the register.');
    } finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    (async () => {
      const me = await fetch('/api/auth/me').then(r => r.json()).catch(() => ({ user: null }));
      setUser(me.user);
      await load();
    })();
  }, [load]);

  /* Auto-sync: a reviewer's decision on this preparer's filing shows up here
     without a manual reload - matches the dashboard's own polling pattern. */
  useEffect(() => {
    const t = setInterval(() => load(true), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const entities = useMemo(
    () => [...new Map(rows.map(r => [r.entity_id, r.entity])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1])), [rows]);
  const cats = useMemo(() => [...new Set(rows.map(r => r.category))].sort(), [rows]);
  const statuses = useMemo(() => [...new Set(rows.map(r => r.status))].sort(), [rows]);
  const availableFys = useMemo(
    () => [...new Set(rows.map(r => r.fy_start_year))].sort((a, b) => b - a),
    [rows]);

  const now = today();
  const curMonth = now.getUTCMonth(), curYear = now.getUTCFullYear();

  const shown = useMemo(() => rows.filter(r => {
    const due = parseDateSafe(r.due_date);
    /* A deep link from a dashboard tile already names an exact set of
       obligations — the month scope would otherwise hide whichever of them
       don't fall due this month. It still respects the financial year the
       dashboard actually counted from (carried via fy, defaulted server
       and client side to the current FY) - the tile's own count is itself
       FY-scoped, so showing every FY here would make the drill-through
       list a bigger set than the number that was clicked. */
    const inScope = deepLinked ? r.fy_start_year === fy : viewScope === 'month'
      ? due.getUTCFullYear() === curYear && due.getUTCMonth() === curMonth
      : r.fy_start_year === fy;
    return inScope &&
      (!entity || r.entity_id === entity) &&
      (!statusList.length || statusList.includes(r.status)) &&
      (!cat || r.category === cat) &&
      (!riskList.length || riskList.includes(r.risk_level)) &&
      (!attentionOnly || (r.status !== 'Approved' && r.status !== 'Not Applicable' && (daysFromToday(r.due_date) ?? 1) <= 0)) &&
      (!q || `${r.title} ${r.code} ${r.reference} ${r.form_reference ?? ''} ${r.period_label}`
        .toLowerCase().includes(q.toLowerCase()));
  }), [rows, viewScope, fy, curMonth, curYear, entity, statusList, cat, riskList, attentionOnly, deepLinked, q]);

  const counts = useMemo(() => ({
    actionable: shown.filter(r => ['Not Started', 'Evidence Pending', 'Overdue', 'Query Raised', 'Rejected'].includes(r.status)).length,
    overdue: shown.filter(r => r.status !== 'Approved' && !r.filed_date && (daysFromToday(r.due_date) ?? 0) < 0).length,
  }), [shown]);

  const cols: Col<Obl & Record<string, unknown>>[] = [
    { key: 'due_date', label: 'Due', sort: true, cls: 'nowrap',
      render: r => {
        const n = daysFromToday(r.due_date);
        const late = r.status !== 'Approved' && !r.filed_date && n != null && n < 0;
        return (<><div className="num">{fmtDate(r.due_date)}</div>
          <div className="t2" style={{ color: late ? 'var(--bad-600)' : undefined }}>
            {late ? `${-(n as number)} d overdue` : n === 0 ? 'today' : r.period_label}
          </div></>);
      } },
    { key: 'title', label: 'Compliance', sort: true, cls: 'w',
      render: r => (<><div className="t1">{r.title}</div>
        <div className="t2">{r.category}{r.form_reference ? ` · ${r.form_reference}` : ''}
          {r.jurisdiction_level && r.jurisdiction_level !== 'federal' ? ` · ${r.jurisdiction}` : ''}</div></>) },
    { key: 'entity', label: 'Entity', sort: true, cls: 'nowrap small',
      render: r => (<><div className="t1">{r.entity}</div><div className="t2">{r.country_code}</div></>) },
    { key: 'risk_level', label: 'Risk', sort: true,
      render: r => <span className={`pill ${RISK_TONE[r.risk_level] ?? 'p-mute'}`}>{r.risk_level}</span> },
    { key: 'files', label: 'Docs', sort: true, cls: 'right', value: r => Number(r.files),
      render: r => Number(r.files)
        ? <span className="pill p-mute nd">{r.files}</span>
        : <span className="dim">none</span> },
    { key: 'status', label: 'Status', sort: true, render: r => <StatusPill s={r.status} /> },
  ];

  if (err) return <Note kind="b">{err}</Note>;

  return (
    <>
      <div className="toolbar no-print">
        <div className="seg">
          <button className={viewScope === 'month' ? 'on' : ''} onClick={() => setViewScope('month')}>This month</button>
          <button className={viewScope === 'year' ? 'on' : ''} onClick={() => setViewScope('year')}>Full year</button>
        </div>
        {viewScope === 'year' && (
          <select value={fy} onChange={e => setFy(Number(e.target.value))} aria-label="Filter by financial year">
            {(availableFys.length ? availableFys : [fy]).map(f => <option key={f} value={f}>{fyLabel(f)}</option>)}
          </select>
        )}
        <select value={entity} onChange={e => setEntity(e.target.value)}>
          <option value="">All entities</option>
          {entities.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All Status</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">All laws</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={risk} onChange={e => setRisk(e.target.value)} aria-label="Filter by risk level">
          <option value="">All risk levels</option>
          {['Critical', 'High', 'Medium', 'Low'].map(rl => <option key={rl} value={rl}>{rl} risk</option>)}
        </select>
        <div className="search">
          <Ic n="search" s={14} />
          <input placeholder="Search compliance, form or reference…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="grow" />
        <span className="small muted">{shown.length} of {rows.length}</span>
        <button className="btn btn-s" onClick={() => load()} disabled={loading}>
          <Ic n="swap" s={13} /> Refresh
        </button>
      </div>

      {counts.overdue > 0 && (
        <div className="mb16">
          <Note kind="w">
            <strong>{counts.overdue} of the obligations shown are past their due date with no
            document uploaded.</strong> Upload the filed return and its supporting evidence to
            move them into review.
          </Note>
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <h3>Compliance register</h3>
          <span className="tiny muted row g6" style={{ alignItems: 'center' }}>
            {counts.actionable > 0 && <BadgeV2 tone="warn">{counts.actionable} awaiting action</BadgeV2>}
            click a row to file or review the history
          </span>
        </div>
        {loading
          ? <div className="card-b">
              {rows.length === 0 && <LawTrivia big />}
              <div style={{ display: 'grid', gap: 10 }}>
                {Array.from({ length: 8 }, (_, r) => (
                  <div key={r} style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
                    {Array.from({ length: 6 }, (_, c) => (
                      <div key={c} className="skel skel-text" style={{ width: c === 0 ? '80%' : '60%' }} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          : <DataTable<Obl & Record<string, unknown>>
              rows={shown as (Obl & Record<string, unknown>)[]}
              cols={cols} rowKey={r => r.id} pageSize={40}
              onRow={r => setOpenId(r.id)}
              empty="No obligations match the current filters." />}
      </div>

      {openId && (
        <ObligationDrawer id={openId} user={user}
                          onClose={() => setOpenId(null)}
                          onChanged={() => { load(); }} />
      )}
    </>
  );
}

/* =========================================================================
   OBLIGATION DRAWER - file the compliance, see validation, follow the trail
   ========================================================================= */
function ObligationDrawer({ id, user, onClose, onChanged }: {
  id: string; user: SessionUser | null; onClose: () => void; onChanged: () => void;
}) {
  const toast = useToast();
  const [d, setD] = useState<{ obligation: Obl; files: EvFile[]; trail: Trail[];
    changes: { old_due_date: string; new_due_date: string; reason: string | null; changed_at: string }[];
    penalty: PenaltyView | null } | null>(null);
  /* The figure a percentage or interest penalty is reckoned on. Asked for only
     where the compliance's own rule needs one - see penalty.needsBase. */
  const [penaltyBase, setPenaltyBase] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState('file');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/obligations/${id}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Unable to open this obligation.');
      setD(j);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Unable to open this obligation.'); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  /* -------------------------------------------------------------- upload */
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('');
  const [comment, setComment] = useState('');
  const [lateReason, setLateReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [over, setOver] = useState(false);
  const [result, setResult] = useState<{ outcome: string; checks: { key: string; label: string; result: string; detail: string }[] } | null>(null);
  const [detectedDate, setDetectedDate] = useState<{ date: string; source: 'extracted' | 'defaulted'; note: string } | null>(null);

  const o = d?.obligation;
  const canFile = !!(o && user && user.permissions.includes('compliance.file') &&
    (user.canFile.includes('*') || user.canFile.includes(o.entity_id)));
  /* Filing today, past the due date, with nothing filed yet - the reason is
     mandatory before either an upload or a nil filing can go through. */
  const filingLate = !!o && o.status !== 'Approved' && !o.filed_date && (daysFromToday(o.due_date) ?? 0) < 0;

  async function upload() {
    if (!file || !o || busy) return;
    if (filingLate) {
      if (!lateReason.trim()) {
        toast('A reason for the late filing is required before this can be submitted.', 'warn');
        return;
      }
      if (lateReason.trim().length < MIN_REMARK_LENGTH) {
        toast(`The reason for late filing needs at least ${MIN_REMARK_LENGTH} characters.`, 'warn');
        return;
      }
    }
    setBusy(true); setPct(8); setResult(null);
    try {
      const fd = new FormData();
      fd.append('obligationId', o.id);
      fd.append('file', file);
      if (docType) fd.append('docType', docType);
      if (comment) fd.append('comment', comment);
      if (filingLate) fd.append('lateReason', lateReason);
      if (penaltyBase.trim()) fd.append('penaltyBase', penaltyBase.trim());
      fd.append('period', o.period_label);

      /* XHR rather than fetch so the progress bar is real, not simulated */
      const res = await new Promise<{ ok: boolean; status: number; body: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/evidence');
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setPct(Math.max(8, Math.round((e.loaded / e.total) * 92)));
        };
        xhr.onload = () => { setPct(100); resolve({ ok: xhr.status < 400, status: xhr.status, body: xhr.responseText }); };
        xhr.onerror = () => reject(new Error('The upload could not reach the server. Check your connection and try again.'));
        xhr.send(fd);
      });

      const j = JSON.parse(res.body || '{}');
      if (!res.ok) throw new Error(j.error ?? `Upload failed (${res.status}).`);

      setResult(j.validation);
      setDetectedDate(j.filedDate ?? null);
      setFile(null); setComment(''); setLateReason('');
      if (inputRef.current) inputRef.current.value = '';
      const dateNote = j.filedDate?.source === 'extracted'
        ? ` Filing date detected from the document: ${fmtDate(j.filedDate.date)}.`
        : j.filedDate ? ` No date found in the document - used the upload date (${fmtDate(j.filedDate.date)}).` : '';
      toast(
        (j.validation?.outcome === 'clean'
          ? 'Uploaded and validated. Sent to the reviewer.'
          : 'Uploaded and sent to the reviewer, with validation warnings.') + dateNote,
        j.validation?.outcome === 'clean' ? 'ok' : 'warn'
      );
      await load();
      onChanged();
      setTab('documents');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Upload failed.', 'bad');
    } finally {
      setBusy(false);
      setTimeout(() => setPct(0), 900);
    }
  }

  async function nilFile() {
    if (!o || busy) return;
    if (filingLate) {
      if (!lateReason.trim()) {
        toast('A reason for the late filing is required before this can be submitted.', 'warn');
        return;
      }
      if (lateReason.trim().length < MIN_REMARK_LENGTH) {
        toast(`The reason for late filing needs at least ${MIN_REMARK_LENGTH} characters.`, 'warn');
        return;
      }
    }
    if (!confirm(`File "${o.title}" (${o.period_label}) as Nil / Not Applicable? This is sent to the reviewer for approval, same as a normal filing.`)) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('obligationId', o.id);
      fd.append('nil', '1');
      if (comment) fd.append('comment', comment);
      if (filingLate) fd.append('lateReason', lateReason);
      if (penaltyBase.trim()) fd.append('penaltyBase', penaltyBase.trim());
      fd.append('period', o.period_label);
      const res = await fetch('/api/evidence', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `Could not file as nil (${res.status}).`);
      toast('Filed as Nil and sent to the reviewer.', 'ok');
      setComment(''); setLateReason('');
      await load();
      onChanged();
      setTab('documents');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not file as nil.', 'bad');
    } finally { setBusy(false); }
  }

  async function withdraw(evId: string, name: string) {
    if (!confirm(`Withdraw "${name}"? The document is retained in the audit trail but no longer counts as evidence.`)) return;
    try {
      const res = await fetch(`/api/evidence?id=${evId}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast('Document withdrawn', 'ok');
      await load(); onChanged();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not withdraw the document.', 'bad'); }
  }

  async function addComment() {
    if (!comment.trim() || !o) return;
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ obligationId: o.id, action: 'comment', comment }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setComment(''); toast('Comment added', 'ok');
      await load(); onChanged();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not add the comment.', 'bad'); }
  }

  if (err) {
    return <Modal title="Obligation" onClose={onClose}><Note kind="b">{err}</Note></Modal>;
  }
  if (!d || !o) {
    return <Modal title="Loading…" onClose={onClose}><Spinner /></Modal>;
  }

  const overdueDays = daysFromToday(o.due_date);
  const isLate = o.status !== 'Approved' && !o.filed_date && (overdueDays ?? 0) < 0;
  const latest = d.files[0];

  return (
    /* The upload action also lives in the footer, which stays put while the
       body scrolls. It was only at the bottom of the filing panel, so on a
       long obligation the preparer had to scroll past the whole record to
       find the button that does the actual work. */
    <Modal size="xw" sub={`${o.entity} · ${o.reference}`} title={o.title} onClose={onClose}
           footer={
             <>
               {canFile && tab === 'file' && (
                 <div className="grow tiny muted" style={{ textAlign: 'left', alignSelf: 'center' }}>
                   {file ? `Ready to send: ${file.name}` : 'Choose a document, or file as Nil for this period.'}
                 </div>
               )}
               <button className="btn" onClick={onClose} disabled={busy}>Close</button>
               {canFile && tab === 'file' && (
                 <button className="btn btn-p" onClick={upload}
                         disabled={!file || busy || (filingLate && lateReason.trim().length < MIN_REMARK_LENGTH)}>
                   <Ic n="upload" s={13} /> {busy ? `Uploading… ${pct}%` : 'Upload and send for review'}
                 </button>
               )}
             </>
           }>

      <div className="grid" style={{ gridTemplateColumns: '1.15fr 1fr', gap: 16 }}>
        <div>
          {o.status !== 'Not Applicable' && (
            <div className="mb16"><Stepper steps={deriveStepperState(o)} /></div>
          )}
          <div className="row g8 wrap mb12">
            <StatusPill s={o.status} />
            <span className={`pill ${RISK_TONE[o.risk_level] ?? 'p-mute'}`}>{o.risk_level} risk</span>
            <span className="pill p-mute nd">{o.frequency}</span>
            <span className="pill p-mute nd">{o.period_label}</span>
            {o.jurisdiction_level && o.jurisdiction_level !== 'federal' && (
              <span className="pill p-info nd">{o.jurisdiction}</span>
            )}
          </div>

          {isLate && (
            <div className="mb12"><Note kind="b">
              Past due by <strong>{-(overdueDays as number)} days</strong> with no evidence uploaded.
              {o.penalty ? <> Penalty exposure: {o.penalty}</> : null}
            </Note></div>
          )}

          {/* Computed exposure, with its workings. Every component is shown
              because a penalty figure a CFO cannot decompose is a figure they
              will not repeat to a board. An absent rule says so rather than
              showing zero - unknown exposure and no exposure are different
              answers, and only one of them is safe to act on. */}
          {d.penalty && d.penalty.delayDays > 0 && (
            <div className="mb12" style={{
              border: '1px solid var(--line-2)', borderRadius: 'var(--r)', padding: '10px 12px',
            }}>
              <div className="row between g8 wrap">
                <span className="cap">Penalty exposure</span>
                <span className="num strong" style={{
                  fontSize: 17,
                  color: d.penalty.total == null ? 'var(--ink-4)'
                    : d.penalty.total > 0 ? 'var(--bad-600)' : 'var(--ok-700)',
                }}>
                  {d.penalty.total == null
                    ? 'Not computable yet'
                    : `${d.penalty.currency ?? ''} ${d.penalty.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`.trim()}
                </span>
              </div>
              {d.penalty.components.length > 0 && (
                <div className="mt8">
                  {d.penalty.components.filter(c => c.amount !== 0).map(c => (
                    <div key={c.key} className="row between g8 small" style={{ padding: '3px 0' }}>
                      <span className="muted">{c.label} <span className="dim tiny">{c.detail}</span></span>
                      <span className="num">{c.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="tiny muted mt4">{d.penalty.note}</div>
              {o.penalty && (
                <div className="tiny dim mt4">As published by the authority: {o.penalty}</div>
              )}
            </div>
          )}
          {o.original_due_date && o.original_due_date.slice(0, 10) !== o.due_date.slice(0, 10) && (
            <div className="mb12"><Note kind="w">
              The due date was revised from {fmtDate(o.original_due_date)} to <strong>{fmtDate(o.due_date)}</strong>.
              Delay is measured against the revised date.
            </Note></div>
          )}

          <dl className="kv mb16">
            <dt>Due date</dt><dd className="num strong">{fmtDate(o.due_date)}</dd>
            <dt>Date of filing</dt>
            <dd className="num">{fmtDate(o.filed_date)}
              {o.delay_days > 0 && <span style={{ color: 'var(--bad-600)' }}> (+{o.delay_days} d)</span>}</dd>
            <dt>Entity</dt><dd>{o.entity_name} · {o.country_name}</dd>
            <dt>Law</dt><dd>{o.category}</dd>
            <dt>Applicable law</dt><dd>{o.applicable_law ?? '-'}</dd>
            <dt>Form / reference</dt><dd>{o.form_reference ?? '-'}</dd>
            <dt>Authority</dt><dd>{o.authority ?? '-'}</dd>
            <dt>Responsible</dt><dd>{o.assigned_to_name ?? <span className="dim">Unassigned</span>}</dd>
            <dt>Reviewer</dt><dd>{o.reviewer_name ?? <span className="dim">Unassigned</span>}</dd>
            {o.government_site && (
              <>
                <dt>Filing portal</dt>
                <dd><a href={o.government_site} target="_blank" rel="noopener noreferrer">
                  Open portal <Ic n="arrowR" s={11} /></a></dd>
              </>
            )}
            {o.penalty && (<><dt>Statutory penalty</dt><dd className="small">{o.penalty}</dd></>)}
          </dl>

          <div className="cap mb8">Evidence required</div>
          {(o.evidence_required ?? []).length === 0 && <div className="small muted">Not specified in the library.</div>}
          {(o.evidence_required ?? []).map((r, i) => {
            const met = d.files.some(f =>
              `${f.doc_type ?? ''} ${f.file_name}`.toLowerCase()
                .split(/[^a-z0-9]+/)
                .some(w => w.length > 3 && r.toLowerCase().includes(w)));
            return (
              <div className="chk" key={i}>
                <span className={`ci ${met ? 'pass' : 'warn'}`}>{met ? '✓' : '!'}</span>
                <div><div className="cl">{r}</div>
                  <div className="cd">{met ? 'A matching document is attached.' : 'Not yet attached.'}</div></div>
              </div>
            );
          })}
        </div>

        <div>
          <div className="tabs" style={{ marginBottom: 12 }}>
            {[
              { id: 'file', label: 'File' },
              { id: 'documents', label: `Documents (${d.files.length})` },
              { id: 'validation', label: 'Validation' },
              { id: 'trail', label: `Trail (${d.trail.length})` },
            ].map(t => (
              <button key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>

          {/* ------------------------------------------------------- FILE */}
          {tab === 'file' && (
            o.status === 'Not Applicable' ? (
              <Note kind="i">
                A reviewer has marked this compliance not applicable to {o.entity}. No filing is
                required and it is excluded from the compliance score.
              </Note>
            ) : canFile ? (
              <>
                <div className="f">
                  <label htmlFor="dt">Document type</label>
                  <select id="dt" value={docType} onChange={e => setDocType(e.target.value)} disabled={busy}>
                    <option value="">Select…</option>
                    {(o.evidence_required ?? []).map(r => <option key={r} value={r}>{r}</option>)}
                    <option value="Other supporting document">Other supporting document</option>
                  </select>
                  <div className="h">
                    The filing date is read automatically from the uploaded document - no need to type it in.
                  </div>
                </div>

                {detectedDate && (
                  <div className="mb8">
                    <Note kind={detectedDate.source === 'extracted' ? 'o' : 'i'}>
                      {detectedDate.source === 'extracted'
                        ? <>Filing date detected from the document: <strong>{fmtDate(detectedDate.date)}</strong>.</>
                        : <>No date found in the document - used the upload date: <strong>{fmtDate(detectedDate.date)}</strong>.</>}
                    </Note>
                  </div>
                )}

                {/* fixed height so the panel never jumps while uploading */}
                <div className={`dz${over ? ' over' : ''}${busy ? ' busy' : ''}`}
                     style={{ minHeight: 118, display: 'grid', placeItems: 'center' }}
                     onClick={() => !busy && inputRef.current?.click()}
                     onDragOver={e => { e.preventDefault(); setOver(true); }}
                     onDragLeave={() => setOver(false)}
                     onDrop={e => {
                       e.preventDefault(); setOver(false);
                       if (busy) return;
                       const f = e.dataTransfer.files?.[0];
                       if (f) setFile(f);
                     }}>
                  <div>
                    <Ic n="upload" s={20} />
                    {file ? (
                      <>
                        <div className="small strong mt8">{file.name}</div>
                        <div className="tiny muted">{fmtBytes(file.size)} · click to choose a different file</div>
                      </>
                    ) : (
                      <>
                        <div className="small strong mt8">Drop the filed document here, or click to browse</div>
                        <div className="tiny muted">PDF, Excel, Word, ZIP or image · up to 4 MB</div>
                      </>
                    )}
                  </div>
                </div>
                <input ref={inputRef} type="file" className="hide"
                       accept=".pdf,.xlsx,.xls,.doc,.docx,.zip,.png,.jpg,.jpeg,.csv,.txt"
                       onChange={e => setFile(e.target.files?.[0] ?? null)} />

                {/* progress slot reserved permanently */}
                <div style={{ height: 3, marginTop: 10 }}>
                  {pct > 0 && <div className="prog"><i style={{ width: `${pct}%` }} /></div>}
                </div>

                <div className="f mt8">
                  <label htmlFor="cm">Note for the reviewer (optional)</label>
                  <textarea id="cm" value={comment} disabled={busy}
                            onChange={e => setComment(e.target.value)}
                            placeholder="Acknowledgement number, portal reference, or anything the reviewer should know." />
                </div>

                {/* Asked for only where this compliance's own penalty rule is
                    reckoned on a figure, and named in the authority's words so
                    the preparer is not left guessing which number is wanted. */}
                {d.penalty?.needsBase && (
                  <div className="f mt8">
                    <label htmlFor="pb">
                      {d.penalty.baseLabel ?? 'Amount the penalty is computed on'}
                      <span style={{ color: 'var(--bad-600)' }}> (required to compute the penalty)</span>
                    </label>
                    <input id="pb" inputMode="decimal" value={penaltyBase} disabled={busy}
                           onChange={e => setPenaltyBase(e.target.value)}
                           placeholder="e.g. 1250000" />
                    <div className="h">
                      This filing is {d.penalty.delayDays} day{d.penalty.delayDays === 1 ? '' : 's'} late and the
                      penalty is a percentage or interest charge, so it cannot be worked out from the dates alone.
                    </div>
                  </div>
                )}

                {filingLate && (
                  <div className="f mt8">
                    <label htmlFor="lr">
                      Reason for late filing <span style={{ color: 'var(--bad-600)' }}>(required)</span>
                    </label>
                    <textarea id="lr" value={lateReason} disabled={busy}
                              onChange={e => setLateReason(e.target.value)}
                              placeholder="Why is this being filed after the due date?" />
                    <div className="tiny dim mt4">
                      {lateReason.trim().length < MIN_REMARK_LENGTH
                        ? `At least ${MIN_REMARK_LENGTH - lateReason.trim().length} more character${MIN_REMARK_LENGTH - lateReason.trim().length === 1 ? '' : 's'} needed.`
                        : 'Looks good.'}
                    </div>
                  </div>
                )}

                <button className="btn btn-p btn-block" onClick={upload}
                        disabled={!file || busy || (filingLate && lateReason.trim().length < MIN_REMARK_LENGTH)}>
                  {busy ? `Uploading… ${pct}%` : 'Upload and send for review'}
                </button>
                <button className="btn btn-block mt8" onClick={nilFile}
                        disabled={busy || (filingLate && lateReason.trim().length < MIN_REMARK_LENGTH)}>
                  <Ic n="alert" s={13} /> File as Nil / Not Applicable for this period
                </button>
                <div className="tiny dim mt4">
                  Use this when there is genuinely nothing to file for {o.period_label} (e.g. a nil
                  return) - no document is required, but a reviewer still has to approve it.
                </div>

                {result && (
                  <div className="mt16">
                    <div className={`note note-${result.outcome === 'clean' ? 'o' : result.outcome === 'blocked' ? 'b' : 'w'} mb8`}>
                      <span style={{ marginTop: 1 }}><Ic n={result.outcome === 'clean' ? 'check2' : 'alert'} s={15} /></span>
                      <div>
                        <strong>
                          {result.outcome === 'clean' ? 'All automatic checks passed.'
                            : result.outcome === 'blocked' ? 'Automatic checks found blocking issues.'
                            : 'Uploaded with warnings for the reviewer.'}
                        </strong>
                      </div>
                    </div>
                    <ValidationChecks v={result} />
                  </div>
                )}
              </>
            ) : (
              <Note kind="i">
                Your role does not include filing for this entity, so upload is disabled.
                You can still read the documents, validation results and the full trail.
                {user?.permissions.includes('compliance.review') && ' Use the Reviews module to approve, reject or raise a query.'}
              </Note>
            )
          )}

          {/* -------------------------------------------------- DOCUMENTS */}
          {tab === 'documents' && (
            <>
              {d.files.length === 0 && (
                <Note kind="w">No documentary evidence has been uploaded against this obligation.
                  Until it is, the obligation cannot be approved and does not count towards the compliance score.</Note>
              )}
              {d.files.map(f => (
                <div className="card mb8" key={f.id}>
                  <div className="card-b">
                    <div className="row between g8 wrap">
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div className="row g6">
                          <Ic n={f.is_nil ? 'alert' : 'doc'} s={14} />
                          <span className="strong small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {f.is_nil ? 'Nil filing - no document required' : f.file_name}
                          </span>
                        </div>
                        <div className="tiny muted mt4">
                          {f.is_nil ? `v${f.version}` : `v${f.version} · ${fmtBytes(Number(f.size_bytes))} · ${f.doc_type ?? 'Unclassified'}`}
                          {f.filed_date ? ` · filed ${fmtDate(f.filed_date)}` : ''}
                        </div>
                        <div className="tiny dim mt4">
                          Uploaded {fmtDateTime(f.uploaded_at)} by {f.uploaded_by_name ?? 'unknown'}
                          {f.reviewed_at ? ` · reviewed ${fmtDateTime(f.reviewed_at)} by ${f.reviewed_by_name}` : ''}
                        </div>
                      </div>
                      <div className="row g6">
                        <span className={`pill ${f.status === 'Approved' ? 'p-ok'
                          : f.status === 'Rejected' ? 'p-bad'
                          : f.status === 'Superseded' ? 'p-mute' : 'p-info'}`}>{f.status}</span>
                      </div>
                    </div>
                    <div className="row g6 mt12 wrap">
                      {!f.is_nil && (
                        <>
                          <a className="btn btn-xs" href={`/api/evidence/${f.id}`} target="_blank" rel="noopener noreferrer">
                            <Ic n="eye" s={12} /> Preview
                          </a>
                          <button className="btn btn-xs"
                                  onClick={() => downloadFile(`/api/evidence/${f.id}?dl=1`, f.file_name, toast)}>
                            <Ic n="download" s={12} /> Download
                          </button>
                        </>
                      )}
                      {f.validation?.outcome && (
                        <span className={`pill ${f.validation.outcome === 'clean' ? 'p-ok'
                          : f.validation.outcome === 'blocked' ? 'p-bad' : 'p-warn'}`}>
                          validation: {f.validation.outcome}
                        </span>
                      )}
                      {canFile && f.status !== 'Superseded' && (
                        <button className="btn btn-xs" style={{ marginLeft: 'auto' }}
                                onClick={() => withdraw(f.id, f.file_name)}>
                          <Ic n="trash" s={12} /> Withdraw
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* -------------------------------------------------- VALIDATION */}
          {tab === 'validation' && (
            latest?.validation
              ? (<>
                  <div className={`note note-${latest.validation.outcome === 'clean' ? 'o'
                    : latest.validation.outcome === 'blocked' ? 'b' : 'w'} mb12`}>
                    <span style={{ marginTop: 1 }}><Ic n="info" s={15} /></span>
                    <div>
                      Automatic checks run on <strong>{latest.file_name}</strong> when it was uploaded.
                      Outcome: <strong>{latest.validation.outcome}</strong>.
                    </div>
                  </div>
                  <ValidationChecks v={latest.validation} />
                </>)
              : <Note kind="i">Validation runs automatically the moment a document is uploaded.
                  Nothing has been uploaded against this obligation yet.</Note>
          )}

          {/* ------------------------------------------------------- TRAIL */}
          {tab === 'trail' && (
            <>
              <div className="tl mb16">
                {d.trail.length === 0 && <div className="small muted">No workflow activity yet.</div>}
                {d.trail.map(t => (
                  <div key={t.id} className={`tl-i ${t.action === 'approve' ? 'ok'
                    : t.action === 'reject' || t.action === 'escalate' ? 'bad'
                    : t.action === 'query' ? 'warn' : ''}`}>
                    <div className="tl-t">
                      <strong>{t.actor ?? 'System'}</strong>
                      <span className="muted"> ({t.actor_role ?? '-'}) </span>
                      {t.action}
                      {t.from_status && t.to_status && t.from_status !== t.to_status && (
                        <span className="muted"> · {t.from_status} → {t.to_status}</span>
                      )}
                      {t.target_user && <span className="muted"> · to {t.target_user}</span>}
                    </div>
                    {t.comment && <div className="small mt4">{t.comment}</div>}
                    <div className="tl-m mt4">{fmtDateTime(t.created_at)}</div>
                  </div>
                ))}
              </div>

              {d.changes.length > 0 && (
                <>
                  <div className="cap mb8">Due date changes</div>
                  {d.changes.map((c, i) => (
                    <div className="small mb4" key={i}>
                      {fmtDate(c.old_due_date)} <Ic n="arrowR" s={10} /> <strong>{fmtDate(c.new_due_date)}</strong>
                      <span className="muted"> - {c.reason ?? 'no reason recorded'} ({fmtDateTime(c.changed_at)})</span>
                    </div>
                  ))}
                </>
              )}

              <div className="f mt16">
                <label htmlFor="ac">Add a comment</label>
                <textarea id="ac" value={comment} onChange={e => setComment(e.target.value)}
                          placeholder="Visible to the preparer, the reviewer and in the audit trail." />
              </div>
              <button className="btn btn-s" onClick={addComment} disabled={!comment.trim()}>
                <Ic n="send" s={13} /> Post comment
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* useSearchParams needs a Suspense boundary so the shell can render immediately
   instead of the whole route opting out of static rendering. */
export default function RegisterPage() {
  return (
    <Suspense fallback={<LawTrivia big />}>
      <RegisterInner />
    </Suspense>
  );
}
