'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ic, Modal, Note, Spinner, DataTable, type Col,
  fmtDate, RISK_TONE, useToast, downloadFile,
} from '@/components/ui';
import ImportModal from '@/components/ImportModal';
import { VividKpiCard, BadgeV2, LawTrivia } from '@/components/ui2';
import type { SessionUser } from '@/lib/rbac';

type Pending = {
  id: number; old_due_date: string | null; new_due_date: string; reason: string | null;
  changed_at: string; compliance_id: string; code: string; title: string; country_code: string;
};

type Comp = {
  id: string; code: string; country_code: string; country_name: string;
  jurisdiction_id: string | null; jurisdiction_name: string | null; jurisdiction_level: string | null;
  category_id: string; category_name: string; title: string; applicable_law: string | null;
  form_reference: string | null; authority: string | null; government_site: string | null;
  frequency: string; due_rule: string | null; due_day: number | null; due_month: number | null;
  evidence_required: string[]; penalty: string | null; risk_level: string;
  /* Computable penalty rule. Absent until the migration adding these columns
     has run, so every one is optional. */
  penalty_currency?: string | null; penalty_per_day?: string | null;
  penalty_per_day_cap?: string | null; penalty_flat?: string | null;
  penalty_rate_pct?: string | null; penalty_interest_pct?: string | null;
  penalty_minimum?: string | null; penalty_base_label?: string | null;
  applies_if_listed: boolean; applies_if_factory: boolean; applies_if_importer: boolean;
  verified: boolean; verified_by: string | null; verified_on: string | null;
  is_archived: boolean; updated_at: string; instances: string;
};
type Ref = {
  countries: { code: string; name: string }[];
  categories: { id: string; name: string }[];
  jurisdictions: { id: string; country_code: string; name: string; level: string; code: string }[];
  availableFys: { startYear: number; label: string }[];
};

const FREQS = ['Monthly', 'Quarterly', 'Half-yearly', 'Annual', 'Event Based', 'Continuous', 'Periodic'];
const RISKS = ['Critical', 'High', 'Medium', 'Low'];

const emptyForm = {
  id: '', code: '', country_code: '', jurisdiction_id: '', category_id: '',
  title: '', applicable_law: '', form_reference: '', authority: '', government_site: '',
  frequency: 'Annual', due_rule: '', due_day: '', due_month: '',
  evidence_required: '', penalty: '', risk_level: 'Medium',
  applies_if_listed: false, applies_if_factory: false, applies_if_importer: false, verified: false,
  /* Computable penalty rule, entered from the authority's published schedule.
     Held as strings because these are form inputs; blank means "not stated",
     which is different from zero and is preserved as null. */
  penalty_currency: '', penalty_per_day: '', penalty_per_day_cap: '',
  penalty_flat: '', penalty_rate_pct: '', penalty_interest_pct: '',
  penalty_minimum: '', penalty_base_label: '',
};

export default function Library() {
  const toast = useToast();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [rows, setRows] = useState<Comp[]>([]);
  const [ref, setRef] = useState<Ref>({ countries: [], categories: [], jurisdictions: [], availableFys: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [syncing, setSyncing] = useState(false);

  const canManageDueDates = !!user?.permissions.includes('duedate.manage');
  const canManageLibrary = !!user?.permissions.includes('compliance.library');
  /* Signing a compliance off is the reviewer's job specifically - holding
     compliance.library (Admin) does not also grant sign-off; removing an
     existing sign-off is a library-admin correction, kept separate. */
  const canSignOff = !!user?.permissions.includes('compliance.verify');
  const unverifiedCount = useMemo(() => rows.filter(r => !r.verified).length, [rows]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSelected = (id: string) => setSelected(s => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const loadPending = useCallback(async () => {
    if (!canManageDueDates) return;
    try {
      const res = await fetch('/api/duedates/pending');
      const d = await res.json();
      if (res.ok) setPending(d.pending);
    } catch { /* non-critical - panel just stays empty */ }
  }, [canManageDueDates]);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setUser(d.user)).catch(() => setUser(null));
  }, []);
  useEffect(() => { loadPending(); }, [loadPending]);

  async function runSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/duedates/sync', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast(`Checked ${j.checked} compliance source${j.checked === 1 ? '' : 's'} - ${j.proposed} possible change${j.proposed === 1 ? '' : 's'} found.`, 'ok');
      await loadPending();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Check failed.', 'bad');
    } finally { setSyncing(false); }
  }

  async function decide(id: number, action: 'approve' | 'reject') {
    try {
      const res = await fetch('/api/duedates/pending', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast(action === 'approve' ? 'Due date updated.' : 'Proposal rejected.', 'ok');
      await loadPending(); load();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not record the decision.', 'bad'); }
  }

  const [country, setCountry] = useState('');
  const [juris, setJuris] = useState('');
  const [fy, setFy] = useState('');
  const [cat, setCat] = useState('');
  const [freq, setFreq] = useState('');
  const [verified, setVerified] = useState('');
  const [q, setQ] = useState('');

  const [edit, setEdit] = useState<typeof emptyForm | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [detail, setDetail] = useState<Comp | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (country) p.set('country', country);
      if (juris) p.set('jurisdiction', juris);
      if (fy) p.set('fy', fy);
      if (cat) p.set('category', cat);
      if (freq) p.set('frequency', freq);
      if (verified) p.set('verified', verified);
      if (q) p.set('search', q);
      const res = await fetch(`/api/compliances?${p}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Unable to load the compliance library.');
      setRows(d.compliances);
      setRef({ countries: d.countries, categories: d.categories, jurisdictions: d.jurisdictions, availableFys: d.availableFys });
      setErr(null);
      /* First load - default to the most recent FY rather than every FY's
         instances summed together, which is what made "In use" look like a
         raw compliance count instead of one year's filing calendar. */
      if (!fy && d.availableFys?.length) setFy(String(d.availableFys[0].startYear));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to load the compliance library.');
    } finally { setLoading(false); }
  }, [country, juris, fy, cat, freq, verified, q]);

  useEffect(() => {
    const t = setTimeout(load, q ? 260 : 0);   // debounce only the free-text search
    return () => clearTimeout(t);
  }, [load, q]);

  /* Auto-sync: a reviewer signing off a compliance from a different session
     shows up here without needing a manual reload - matches the dashboard's
     own polling pattern. */
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const jurisForCountry = useMemo(
    () => ref.jurisdictions.filter(j => !country || j.country_code === country), [ref, country]);

  const stats = useMemo(() => ({
    total: rows.length,
    state: rows.filter(r => r.jurisdiction_level && r.jurisdiction_level !== 'federal').length,
    inUse: rows.filter(r => Number(r.instances) > 0).length,
  }), [rows]);

  async function save() {
    if (!edit) return;
    const payload = {
      ...edit,
      due_day: edit.due_day ? parseInt(edit.due_day, 10) : null,
      due_month: edit.due_month ? parseInt(edit.due_month, 10) : null,
      evidence_required: edit.evidence_required.split('|').map(s => s.trim()).filter(Boolean),
      id: edit.id || undefined,
      /* Blank stays null rather than becoming 0 - "the authority does not
         charge this" and "we have not recorded what they charge" must not
         collapse into the same stored value. */
      ...Object.fromEntries((
        ['penalty_per_day', 'penalty_per_day_cap', 'penalty_flat',
         'penalty_rate_pct', 'penalty_interest_pct', 'penalty_minimum'] as const
      ).map(k => {
        const raw = String((edit as Record<string, unknown>)[k] ?? '').replace(/[,\s]/g, '');
        return [k, raw === '' ? null : Number(raw)];
      })),
      penalty_currency: edit.penalty_currency.trim().toUpperCase() || null,
      penalty_base_label: edit.penalty_base_label.trim() || null,
    };
    try {
      const res = await fetch('/api/compliances', {
        method: edit.id ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast(edit.id ? 'Compliance updated. It is active immediately.' : 'Compliance created and active.', 'ok');
      setEdit(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save.', 'bad'); }
  }

  async function act(c: Comp, mode: 'archive' | 'delete' | 'restore') {
    const msg = mode === 'delete'
      ? `Delete "${c.title}"? It is removed from the library and its ${c.instances} open obligations are withdrawn. History is retained.`
      : mode === 'archive'
      ? `Archive "${c.title}"? It stops generating new obligations but existing ones remain.`
      : `Restore "${c.title}" to the active library?`;
    if (!confirm(msg)) return;
    try {
      const res = await fetch(`/api/compliances?id=${c.id}&mode=${mode}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast(`Compliance ${mode}d`, 'ok');
      load();
    } catch (e) { toast(e instanceof Error ? e.message : 'Action failed.', 'bad'); }
  }

  async function verify(c: Comp) {
    try {
      const res = await fetch('/api/compliances', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: c.id, verified: !c.verified }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast(c.verified ? 'Reviewed status removed' : 'Reviewed', 'ok');
      load();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not update.', 'bad'); }
  }

  async function bulkSignOff() {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      const res = await fetch('/api/compliances', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids, verified: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast(`Reviewed ${j.verified.length} compliance${j.verified.length === 1 ? '' : 's'}${j.skipped ? ` (${j.skipped} already reviewed)` : ''}.`, 'ok');
      setSelected(new Set());
      load();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not sign off the selected items.', 'bad'); }
  }

  const cols: Col<Comp & Record<string, unknown>>[] = [
    ...(canSignOff ? [{
      key: 'select', label: '', cls: 'nowrap no-print' as string,
      render: (r: Comp) => !r.verified && (
        <input type="checkbox" checked={selected.has(r.id)}
               onClick={e => e.stopPropagation()}
               onChange={() => toggleSelected(r.id)} />
      ),
    }] : []),
    { key: 'title', label: 'Compliance', sort: true, cls: 'w',
      render: r => (<>
        <div className="t1">{r.title}</div>
        <div className="t2">
          <span className="mono">{r.code}</span> · {r.category_name}
          {r.form_reference ? ` · ${r.form_reference}` : ''}
          {r.applicable_law ? ` · ${r.applicable_law}` : ''}
        </div>
      </>) },
    { key: 'country_name', label: 'Jurisdiction', sort: true, cls: 'nowrap small',
      render: r => (<>
        <div className="t1">{r.country_name}</div>
        {r.jurisdiction_level && r.jurisdiction_level !== 'federal'
          ? <div className="t2"><span className="pill p-info nd tiny">{r.jurisdiction_name}</span></div>
          : <div className="t2">National</div>}
      </>) },
    { key: 'frequency', label: 'Frequency', sort: true, cls: 'small nowrap' },
    { key: 'risk_level', label: 'Risk', sort: true,
      render: r => <span className={`pill ${RISK_TONE[r.risk_level] ?? 'p-mute'}`}>{r.risk_level}</span> },
    { key: 'verified', label: 'Status', sort: true, value: r => (r.verified ? 1 : 0),
      render: r => r.verified
        ? <span title={`${r.verified_by ?? ''} ${r.verified_on ?? ''}`}><BadgeV2 tone="ok">Reviewed</BadgeV2></span>
        : <BadgeV2 tone="mute">New obligation/amendment</BadgeV2> },
    { key: 'actions', label: '', cls: 'nowrap no-print',
      render: r => (
        <div className="row g4">
          {canManageLibrary && (
            <button className="btn btn-xs" title="Edit"
                    onClick={e => {
                      e.stopPropagation();
                      setEdit({
                        id: r.id, code: r.code, country_code: r.country_code,
                        jurisdiction_id: r.jurisdiction_id ?? '', category_id: r.category_id,
                        title: r.title, applicable_law: r.applicable_law ?? '',
                        form_reference: r.form_reference ?? '', authority: r.authority ?? '',
                        government_site: r.government_site ?? '', frequency: r.frequency,
                        due_rule: r.due_rule ?? '', due_day: r.due_day ? String(r.due_day) : '',
                        due_month: r.due_month ? String(r.due_month) : '',
                        evidence_required: (r.evidence_required ?? []).join(' | '),
                        penalty: r.penalty ?? '', risk_level: r.risk_level,
                        applies_if_listed: r.applies_if_listed, applies_if_factory: r.applies_if_factory,
                        applies_if_importer: r.applies_if_importer, verified: r.verified,
                        /* Null reads back as blank, so an unrecorded rate stays
                           unrecorded rather than being saved as 0 on the next
                           edit of an unrelated field. */
                        penalty_currency: r.penalty_currency ?? '',
                        penalty_per_day: r.penalty_per_day ?? '',
                        penalty_per_day_cap: r.penalty_per_day_cap ?? '',
                        penalty_flat: r.penalty_flat ?? '',
                        penalty_rate_pct: r.penalty_rate_pct ?? '',
                        penalty_interest_pct: r.penalty_interest_pct ?? '',
                        penalty_minimum: r.penalty_minimum ?? '',
                        penalty_base_label: r.penalty_base_label ?? '',
                      });
                    }}><Ic n="edit" s={12} /></button>
          )}
          {!r.verified && canSignOff && (
            <button className="btn btn-xs" title="Sign off"
                    onClick={e => { e.stopPropagation(); verify(r); }}><Ic n="shield" s={12} /></button>
          )}
          {r.verified && canManageLibrary && (
            <button className="btn btn-xs" title="Remove sign-off"
                    onClick={e => { e.stopPropagation(); verify(r); }}><Ic n="shield" s={12} /></button>
          )}
          {canManageLibrary && (r.is_archived
            ? <button className="btn btn-xs" title="Restore"
                      onClick={e => { e.stopPropagation(); act(r, 'restore'); }}><Ic n="swap" s={12} /></button>
            : <button className="btn btn-xs" title="Archive"
                      onClick={e => { e.stopPropagation(); act(r, 'archive'); }}><Ic n="trash" s={12} /></button>)}
        </div>
      ) },
  ];

  if (err) return <Note kind="b">{err}</Note>;

  return (
    <>
      {canManageDueDates && (
        <div className="card mb16 stagger-in stagger-1">
          <div className="card-h">
            <div>
              <h3>Due-date sync</h3>
              <span className="tiny muted">
                Checks each compliance's government source for a different due date. Nothing changes
                until you approve a proposal below.
              </span>
            </div>
            <button className="btn btn-s no-print" onClick={runSync} disabled={syncing}>
              <Ic n="swap" s={13} /> {syncing ? 'Checking…' : 'Check for updates now'}
            </button>
          </div>
          <div className="card-b">
            {pending.length === 0
              ? <div className="small muted">No proposed changes awaiting a decision.</div>
              : pending.map(p => (
                <div key={p.id} className="row between g8 wrap" style={{ padding: '9px 0', borderBottom: '1px solid var(--line-2)' }}>
                  <div className="grow">
                    <div className="row g8 wrap" style={{ alignItems: 'center' }}>
                      <span className="small strong">{p.title}</span>
                      <BadgeV2 tone="info">Proposed</BadgeV2>
                    </div>
                    <div className="tiny muted mt4">
                      {p.old_due_date ? <>{fmtDate(p.old_due_date)} <Ic n="arrowR" s={10} /> </> : null}
                      <strong>{fmtDate(p.new_due_date)}</strong> · {p.country_code}
                    </div>
                    {p.reason && <div className="tiny dim mt4">{p.reason}</div>}
                  </div>
                  <div className="row g6">
                    <button className="btn btn-xs" onClick={() => decide(p.id, 'reject')}>Reject</button>
                    <button className="btn btn-xs btn-p" onClick={() => decide(p.id, 'approve')}>Approve</button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="toolbar no-print">
        <select value={country} onChange={e => { setCountry(e.target.value); setJuris(''); }}>
          <option value="">All countries</option>
          {ref.countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <select value={juris} onChange={e => setJuris(e.target.value)} aria-label="Filter by jurisdiction">
          <option value="">All jurisdictions</option>
          {jurisForCountry.map(j => (
            <option key={j.id} value={j.id}>{j.name}{j.level !== 'federal' ? ` (${j.level})` : ''}</option>
          ))}
        </select>
        <select value={fy} onChange={e => setFy(e.target.value)} aria-label="Filter by financial year">
          {ref.availableFys.map(f => <option key={f.startYear} value={f.startYear}>{f.label}</option>)}
        </select>
        <select value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">All laws</option>
          {ref.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={freq} onChange={e => setFreq(e.target.value)}>
          <option value="">All frequencies</option>
          {FREQS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={verified} onChange={e => setVerified(e.target.value)}>
          <option value="">Any status</option>
          <option value="yes">Reviewed</option>
          <option value="no">New obligation/amendment</option>
        </select>
        <div className="search">
          <Ic n="search" s={14} />
          <input placeholder="Search title, law, form or code…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>

      <div className="grid g-3 mb16 stagger-in stagger-2">
        <VividKpiCard label="Compliance list" value={stats.total} sub="Matching the current filters" icon="book" gradient="var(--grad-primary)" />
        <VividKpiCard label="State / provincial" value={stats.state} sub="Apply only where registered" icon="globe" gradient="var(--grad-teal)" />
        <VividKpiCard label="Applicable Obligations" value={stats.inUse} sub="Live in the register" icon="list" gradient="var(--grad-violet)" />
      </div>

      <div className="card stagger-in stagger-3">
        <div className="card-h">
          <h3>Compliance library</h3>
          <div className="row g6 wrap no-print">
            {canSignOff && unverifiedCount > 0 && (
              selected.size === unverifiedCount
                ? <button className="btn btn-s" onClick={() => setSelected(new Set())}>Clear selection</button>
                : <button className="btn btn-s"
                          onClick={() => setSelected(new Set(rows.filter(r => !r.verified).map(r => r.id)))}>
                    Select all pending ({unverifiedCount})
                  </button>
            )}
            {canSignOff && selected.size > 0 && (
              <button className="btn btn-p btn-s" onClick={bulkSignOff}>
                <Ic n="shield" s={13} /> Sign off selected ({selected.size})
              </button>
            )}
            {canManageLibrary && (
              <>
                <button className="btn btn-s" onClick={() => setImportOpen(true)}>
                  <Ic n="sheet" s={13} /> Import from Excel
                </button>
                <button className="btn btn-s"
                        onClick={() => downloadFile(
                          `/api/compliances/template${country ? `?country=${country}` : ''}`,
                          'SGCMP_Compliance_Template.xlsx', toast)}>
                  <Ic n="download" s={13} /> Template
                </button>
                <button className="btn btn-p btn-s"
                        onClick={() => setEdit({ ...emptyForm, country_code: country || (ref.countries[0]?.code ?? '') })}>
                  <Ic n="plus" s={13} /> New compliance
                </button>
              </>
            )}
          </div>
        </div>
        {loading
          ? <div className="card-b">
              {rows.length === 0 && <LawTrivia big />}
              <div style={{ display: 'grid', gap: 10 }}>
                {Array.from({ length: 10 }, (_, r) => (
                  <div key={r} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
                    {Array.from({ length: 5 }, (_, c) => (
                      <div key={c} className="skel skel-text" style={{ width: c === 0 ? '80%' : '60%' }} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          : <DataTable<Comp & Record<string, unknown>>
              rows={rows as (Comp & Record<string, unknown>)[]}
              cols={cols} rowKey={r => r.id} pageSize={50}
              onRow={r => setDetail(r)}
              empty="No compliances match the current filters." />}
        <div className="card-f row g16 wrap tiny muted">
          <strong>Risk rating:</strong>
          <span className="row g6"><span className={`pill ${RISK_TONE.Critical}`}>Critical</span> statutory/financial exposure if missed - board-level attention</span>
          <span className="row g6"><span className={`pill ${RISK_TONE.High}`}>High</span> material penalty or licence risk</span>
          <span className="row g6"><span className={`pill ${RISK_TONE.Medium}`}>Medium</span> a fixed penalty or administrative consequence</span>
          <span className="row g6"><span className={`pill ${RISK_TONE.Low}`}>Low</span> limited consequence, but still a legal obligation</span>
        </div>
      </div>

      {/* ------------------------------------------------------------ editor */}
      {edit && (
        <Modal size="w" title={edit.id ? 'Edit compliance' : 'New compliance'}
               sub={edit.id ? edit.code : 'Becomes active immediately'}
               onClose={() => setEdit(null)}
               footer={<>
                 <button className="btn" onClick={() => setEdit(null)}>Cancel</button>
                 <button className="btn btn-p" onClick={save}
                         disabled={!edit.title || !edit.country_code || !edit.category_id}>
                   {edit.id ? 'Save changes' : 'Create compliance'}
                 </button>
               </>}>
          <div className="f">
            <label>Compliance name *</label>
            <input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })}
                   placeholder="Annual corporate income tax return" />
          </div>

          <div className="f3">
            <div className="f">
              <label>Country *</label>
              <select value={edit.country_code}
                      onChange={e => setEdit({ ...edit, country_code: e.target.value, jurisdiction_id: '' })}>
                <option value="">Select…</option>
                {ref.countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>
            <div className="f">
              <label>Jurisdiction level</label>
              <select value={edit.jurisdiction_id} onChange={e => setEdit({ ...edit, jurisdiction_id: e.target.value })}>
                <option value="">National / federal</option>
                {ref.jurisdictions.filter(j => j.country_code === edit.country_code && j.level !== 'federal')
                  .map(j => <option key={j.id} value={j.id}>{j.name} ({j.level})</option>)}
              </select>
              <div className="h">State-level records apply only to entities registered there.</div>
            </div>
            <div className="f">
              <label>Law *</label>
              <select value={edit.category_id} onChange={e => setEdit({ ...edit, category_id: e.target.value })}>
                <option value="">Select…</option>
                {ref.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="f2">
            <div className="f">
              <label>Applicable law</label>
              <input value={edit.applicable_law} onChange={e => setEdit({ ...edit, applicable_law: e.target.value })}
                     placeholder="Income-tax Act, 1961 - section 139(1)" />
            </div>
            <div className="f">
              <label>Form / reference</label>
              <input value={edit.form_reference} onChange={e => setEdit({ ...edit, form_reference: e.target.value })}
                     placeholder="Form ITR-6" />
            </div>
          </div>

          <div className="f2">
            <div className="f">
              <label>Authority</label>
              <input value={edit.authority} onChange={e => setEdit({ ...edit, authority: e.target.value })} />
            </div>
            <div className="f">
              <label>Government website</label>
              <input value={edit.government_site} onChange={e => setEdit({ ...edit, government_site: e.target.value })}
                     placeholder="https://" />
            </div>
          </div>

          <div className="f3">
            <div className="f">
              <label>Frequency *</label>
              <select value={edit.frequency} onChange={e => setEdit({ ...edit, frequency: e.target.value })}>
                {FREQS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="f">
              <label>Due day</label>
              <input type="number" min={1} max={31} value={edit.due_day}
                     onChange={e => setEdit({ ...edit, due_day: e.target.value })} />
            </div>
            <div className="f">
              <label>Due month</label>
              <input type="number" min={1} max={12} value={edit.due_month}
                     onChange={e => setEdit({ ...edit, due_month: e.target.value })} />
            </div>
          </div>

          <div className="f">
            <label>Due rule (in words)</label>
            <input value={edit.due_rule} onChange={e => setEdit({ ...edit, due_rule: e.target.value })}
                   placeholder="Within 6 months of the financial year end" />
          </div>

          <div className="f">
            <label>Evidence required</label>
            <textarea value={edit.evidence_required}
                      onChange={e => setEdit({ ...edit, evidence_required: e.target.value })}
                      placeholder="Filed return with acknowledgement | Payment challan | Computation working" />
            <div className="h">Separate each required document with a pipe character.</div>
          </div>

          <div className="f2">
            <div className="f">
              <label>Risk</label>
              <select value={edit.risk_level} onChange={e => setEdit({ ...edit, risk_level: e.target.value })}>
                {RISKS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="f">
              <label>Code</label>
              <input value={edit.code} onChange={e => setEdit({ ...edit, code: e.target.value })}
                     placeholder="Auto-generated if left blank" disabled={!!edit.id} />
            </div>
          </div>

          <div className="f">
            <label>Statutory penalty for delay</label>
            <textarea value={edit.penalty} onChange={e => setEdit({ ...edit, penalty: e.target.value })} />
            <div className="h">
              The authority&apos;s own wording. Enter the computable figures below so the platform can
              work out an exposure rather than only quoting the provision.
            </div>
          </div>

          {/* The same provision in a form that can be computed. Left blank the
              platform reports "no rule recorded" rather than a zero exposure -
              so a compliance nobody has costed is visibly uncosted instead of
              looking compliant and free. */}
          <div className="f">
            <label>How the penalty is computed</label>
            <div className="h mb8">
              Fill only what the provision actually says. A compliance may carry both a daily fee and
              interest on an amount - both will be applied. Take every figure from the authority&apos;s
              published schedule, not from memory.
            </div>

            <div className="f3">
              <div className="f">
                <label htmlFor="pcur">Currency</label>
                <input id="pcur" value={edit.penalty_currency} maxLength={3} placeholder="INR"
                       onChange={e => setEdit({ ...edit, penalty_currency: e.target.value })} />
              </div>
              <div className="f">
                <label htmlFor="ppd">Per day of delay</label>
                <input id="ppd" inputMode="decimal" value={edit.penalty_per_day} placeholder="e.g. 50"
                       onChange={e => setEdit({ ...edit, penalty_per_day: e.target.value })} />
              </div>
              <div className="f">
                <label htmlFor="ppdc">Cap on the daily fee</label>
                <input id="ppdc" inputMode="decimal" value={edit.penalty_per_day_cap} placeholder="e.g. 5000"
                       onChange={e => setEdit({ ...edit, penalty_per_day_cap: e.target.value })} />
              </div>
            </div>

            <div className="f3">
              <div className="f">
                <label htmlFor="pflat">Fixed penalty</label>
                <input id="pflat" inputMode="decimal" value={edit.penalty_flat} placeholder="charged once"
                       onChange={e => setEdit({ ...edit, penalty_flat: e.target.value })} />
              </div>
              <div className="f">
                <label htmlFor="prate">% of the base amount</label>
                <input id="prate" inputMode="decimal" value={edit.penalty_rate_pct} placeholder="e.g. 2"
                       onChange={e => setEdit({ ...edit, penalty_rate_pct: e.target.value })} />
              </div>
              <div className="f">
                <label htmlFor="pint">Interest, % a year</label>
                <input id="pint" inputMode="decimal" value={edit.penalty_interest_pct} placeholder="e.g. 18"
                       onChange={e => setEdit({ ...edit, penalty_interest_pct: e.target.value })} />
                <div className="h">Enter a monthly rate as its annual equivalent - 1% a month is 12.</div>
              </div>
            </div>

            <div className="f2">
              <div className="f">
                <label htmlFor="pmin">Statutory minimum</label>
                <input id="pmin" inputMode="decimal" value={edit.penalty_minimum} placeholder="floor on the total"
                       onChange={e => setEdit({ ...edit, penalty_minimum: e.target.value })} />
              </div>
              <div className="f">
                <label htmlFor="pbl">What the base amount is</label>
                <input id="pbl" value={edit.penalty_base_label} placeholder="e.g. Tax payable"
                       onChange={e => setEdit({ ...edit, penalty_base_label: e.target.value })} />
                <div className="h">
                  Required if a percentage or interest is set - this is the wording the preparer is
                  asked for when they file, so use the authority&apos;s own term.
                </div>
              </div>
            </div>
          </div>

          <div className="f">
            <label>Applicability conditions</label>
            <div className="row g16 wrap mt4">
              {([
                ['applies_if_listed', 'Only listed entities'],
                ['applies_if_factory', 'Only entities with a factory'],
                ['applies_if_importer', 'Only importers / exporters'],
                ['verified', 'Verified by local adviser'],
              ] as const).map(([k, l]) => (
                <label key={k} className="small row g6" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={edit[k] as boolean} style={{ width: 'auto' }}
                         onChange={e => setEdit({ ...edit, [k]: e.target.checked })} />
                  {l}
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* ------------------------------------------------------------ detail */}
      {detail && (
        <Modal size="w" title={detail.title} sub={detail.code} onClose={() => setDetail(null)}
               footer={<button className="btn" onClick={() => setDetail(null)}>Close</button>}>
          <div className="row g6 wrap mb16">
            <span className="pill p-mute nd">{detail.country_name}</span>
            {detail.jurisdiction_level && detail.jurisdiction_level !== 'federal' && (
              <span className="pill p-info nd">{detail.jurisdiction_name} ({detail.jurisdiction_level})</span>
            )}
            <span className="pill p-mute nd">{detail.category_name}</span>
            <span className="pill p-mute nd">{detail.frequency}</span>
            <span className={`pill ${RISK_TONE[detail.risk_level] ?? 'p-mute'}`}>{detail.risk_level}</span>
            {detail.verified
              ? <span className="pill p-ok">Reviewed{detail.verified_by ? ` - ${detail.verified_by}` : ''}</span>
              : <span className="pill p-warn">New obligation/amendment</span>}
          </div>
          <dl className="kv">
            <dt>Applicable law</dt><dd>{detail.applicable_law ?? '-'}</dd>
            <dt>Form / reference</dt><dd>{detail.form_reference ?? '-'}</dd>
            <dt>Authority</dt><dd>{detail.authority ?? '-'}</dd>
            <dt>Due rule</dt><dd>{detail.due_rule ?? '-'}</dd>
            <dt>Government portal</dt>
            <dd>{detail.government_site
              ? <a href={detail.government_site} target="_blank" rel="noopener noreferrer">{detail.government_site}</a>
              : '-'}</dd>
            <dt>Statutory penalty</dt><dd>{detail.penalty ?? '-'}</dd>
            <dt>Open obligations</dt><dd className="num">{detail.instances}</dd>
            <dt>Applicability</dt>
            <dd>{[
              detail.applies_if_listed && 'listed entities only',
              detail.applies_if_factory && 'entities with a factory only',
              detail.applies_if_importer && 'importers only',
            ].filter(Boolean).join('; ') || 'all entities in this jurisdiction'}</dd>
            <dt>Last updated</dt><dd>{fmtDate(detail.updated_at)}</dd>
          </dl>
          <div className="cap mt16 mb8">Evidence required</div>
          {(detail.evidence_required ?? []).length === 0 && <div className="small muted">Not specified.</div>}
          {(detail.evidence_required ?? []).map((r, i) => (
            <div className="small row g6" key={i} style={{ padding: '3px 0' }}><Ic n="chevR" s={11} /> {r}</div>
          ))}
        </Modal>
      )}

      {importOpen && (
        <ImportModal kind="compliance" countries={ref.countries}
                     onClose={() => setImportOpen(false)}
                     onDone={() => { setImportOpen(false); load(); }} />
      )}
    </>
  );
}
