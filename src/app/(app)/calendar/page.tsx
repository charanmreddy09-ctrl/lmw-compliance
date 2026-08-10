'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ic, Modal, Note, StatusPill, useToast, downloadFile,
  fmtDate, fmtDateTime, RISK_TONE,
} from '@/components/ui';
import { VividKpiCard, SkeletonCard } from '@/components/ui2';
import ImportModal from '@/components/ImportModal';
import type { SessionUser } from '@/lib/rbac';

type Ev = {
  id: string; due_date: string; status: string; period_label: string; delay_days: number;
  title: string; code: string; risk_level: string; frequency: string; form_reference: string | null;
  category: string; entity: string; entity_id: string; country_code: string; jurisdiction: string | null;
};
type Change = {
  obligation_id: string; old_due_date: string; new_due_date: string;
  reason: string | null; changed_at: string;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function tone(status: string, due: string): 'ok' | 'warn' | 'bad' | 'info' {
  if (status === 'Approved') return 'ok';
  if (status === 'Rejected') return 'bad';
  if (status === 'Query Raised') return 'warn';
  const overdue = new Date(due + 'T00:00:00Z').getTime() <
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  if (overdue && status !== 'Submitted' && status !== 'Under Review') return 'bad';
  if (status === 'Submitted' || status === 'Under Review') return 'info';
  return 'warn';
}

export default function Calendar() {
  const toast = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [entity, setEntity] = useState('');
  const [events, setEvents] = useState<Ev[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [entities, setEntities] = useState<{ id: string; short_name: string; country_code: string }[]>([]);
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([]);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [view, setView] = useState<'month' | 'list'>('month');
  const [dayFilter, setDayFilter] = useState<'all' | 'yesterday' | 'today' | 'tomorrow'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ year: String(year), month: String(month) });
      if (entity) p.set('entity', entity);
      const res = await fetch(`/api/calendar?${p}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Unable to load the calendar.');
      setEvents(d.events); setChanges(d.changes); setEntities(d.entities);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to load the calendar.');
    } finally { setLoading(false); }
  }, [year, month, entity]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      const [me, lib] = await Promise.all([
        fetch('/api/auth/me').then(r => r.json()).catch(() => ({ user: null })),
        fetch('/api/compliances?country=__none__').then(r => r.json()).catch(() => ({ countries: [] })),
      ]);
      setUser(me.user);
      setCountries(lib.countries ?? []);
    })();
  }, []);

  /* ------------------------------------------------------------ month grid */
  const grid = useMemo(() => {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const startDow = (first.getUTCDay() + 6) % 7;              // Monday-first
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cells: { date: string | null; day: number; out: boolean; wknd: boolean }[] = [];

    const prevDays = new Date(Date.UTC(year, month - 1, 0)).getUTCDate();
    for (let i = startDow - 1; i >= 0; i--) {
      cells.push({ date: null, day: prevDays - i, out: true, wknd: false });
    }
    for (let dd = 1; dd <= daysInMonth; dd++) {
      const dt = new Date(Date.UTC(year, month - 1, dd));
      const dow = dt.getUTCDay();
      cells.push({
        date: dt.toISOString().slice(0, 10), day: dd, out: false,
        wknd: dow === 0 || dow === 6,
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ date: null, day: cells.length % 7, out: true, wknd: false });
    }
    return cells;
  }, [year, month]);

  const byDay = useMemo(() => {
    const m = new Map<string, Ev[]>();
    events.forEach(e => {
      const k = String(e.due_date).slice(0, 10);
      (m.get(k) ?? m.set(k, []).get(k)!).push(e);
    });
    return m;
  }, [events]);

  const changedIds = useMemo(() => new Set(changes.map(c => c.obligation_id)), [changes]);
  const todayIso = new Date().toISOString().slice(0, 10);

  /* The Today/Tomorrow/Yesterday dropdown filters the List view down to one
     specific real-world day, regardless of which month is being browsed -
     switching to it also navigates month/year so that day's events are
     actually loaded, then filters client-side to just that date. */
  const dayFilterIso = useMemo(() => {
    if (dayFilter === 'all') return null;
    const base = new Date();
    const offset = dayFilter === 'yesterday' ? -1 : dayFilter === 'tomorrow' ? 1 : 0;
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offset));
    return d.toISOString().slice(0, 10);
  }, [dayFilter]);

  function applyDayFilter(f: typeof dayFilter) {
    setDayFilter(f);
    if (f === 'all') return;
    const d = new Date(dayFilterIsoFor(f));
    setYear(d.getUTCFullYear()); setMonth(d.getUTCMonth() + 1);
    setView('list');
  }
  function dayFilterIsoFor(f: typeof dayFilter): string {
    const base = new Date();
    const offset = f === 'yesterday' ? -1 : f === 'tomorrow' ? 1 : 0;
    return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + offset)).toISOString();
  }

  const listEvents = useMemo(
    () => dayFilterIso ? events.filter(e => String(e.due_date).slice(0, 10) === dayFilterIso) : events,
    [events, dayFilterIso]);

  const stats = useMemo(() => ({
    total: events.length,
    approved: events.filter(e => e.status === 'Approved').length,
    overdue: events.filter(e => tone(e.status, String(e.due_date).slice(0, 10)) === 'bad').length,
    open: events.filter(e => !['Approved'].includes(e.status)).length,
  }), [events]);

  function shift(n: number) {
    setDayFilter('all');
    const d = new Date(Date.UTC(year, month - 1 + n, 1));
    setYear(d.getUTCFullYear()); setMonth(d.getUTCMonth() + 1);
  }

  const canManage = user?.permissions.includes('duedate.manage');

  if (err) return <Note kind="b">{err}</Note>;

  return (
    <>
      <div className="toolbar no-print">
        {/* Month stepper, then the view switch. The reset-to-current-month
            button that used to sit between the arrows is gone: it read as a
            second "Today" next to the day filter's own, and the day filter
            already moves the calendar to that day's month, so nothing was
            lost by removing it. */}
        <div className="row g4">
          <button className="btn btn-s" onClick={() => shift(-1)} aria-label="Previous month">
            <Ic n="back" s={13} />
          </button>
          <button className="btn btn-s" onClick={() => shift(1)} aria-label="Next month">
            <Ic n="chevR" s={13} />
          </button>
        </div>

        <div className="seg">
          <button className={view === 'month' ? 'on' : ''} onClick={() => setView('month')}>Month</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
        </div>

        {/* The period being viewed sits with the controls that change it,
            rather than after the filters that only narrow what is inside it. */}
        <h2 style={{ minWidth: 168 }}>{MONTHS[month - 1]} {year}</h2>

        <select value={entity} onChange={e => setEntity(e.target.value)}>
          <option value="">Entities</option>
          {entities.map(e => <option key={e.id} value={e.id}>{e.short_name} ({e.country_code})</option>)}
        </select>

        {/* The three days a compliance team actually asks about are on the
            face of the toolbar rather than inside a dropdown, with the full
            month alongside them. */}
        <div className="seg">
          {([
            ['yesterday', 'Yesterday'],
            ['today', 'Today'],
            ['tomorrow', 'Tomorrow'],
            ['all', 'Full month'],
          ] as const).map(([id, label]) => (
            <button key={id} className={dayFilter === id ? 'on' : ''}
                    onClick={() => applyDayFilter(id)}>{label}</button>
          ))}
        </div>

        <div className="grow" />
        {canManage && (
          <button className="btn btn-p btn-s" onClick={() => setUploadOpen(true)}>
            <Ic n="upload" s={13} /> Upload due dates
          </button>
        )}
        <button className="btn btn-s" onClick={() => window.print()}><Ic n="doc" s={13} /> Print</button>
      </div>

      <div className="grid g-4 mb16">
        <VividKpiCard label="Falling due this month" value={stats.total} icon="cal" gradient="var(--grad-teal)"
                      sub="Across the selected scope" />
        <VividKpiCard label="Approved" value={stats.approved} icon="check2" gradient="var(--grad-emerald)"
                      sub="Evidence accepted" />
        <VividKpiCard label="Open" value={stats.open} icon="clock" gradient="var(--grad-amber)"
                      sub="Needs filing or review" />
        <VividKpiCard label="Overdue" value={stats.overdue} icon="alert" gradient="var(--grad-coral)"
                      sub="Past due, not filed" />
      </div>

      {changes.length > 0 && (
        <div className="mb16">
          <Note kind="w">
            <strong>{changes.length} due date{changes.length === 1 ? '' : 's'} in this month have been revised.</strong>{' '}
            Revised entries are marked with a dot in the calendar. Everyone attached to the affected
            entities has been notified.
          </Note>
        </div>
      )}

      {loading && (
        <div className="card"><div className="card-b">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {Array.from({ length: 35 }, (_, i) => <div key={i} className="skel skel-card" style={{ height: 112 }} />)}
          </div>
        </div></div>
      )}

      {!loading && view === 'month' && (
        <div className="card"><div className="card-b">
          <div className="cal" style={{ marginBottom: 3 }}>
            {DOW.map(d => <div className="cdow" key={d}>{d}</div>)}
          </div>
          <div className="cal reveal-cal" key={`${year}-${month}`}>
            {grid.map((c, i) => {
              const list = c.date ? (byDay.get(c.date) ?? []) : [];
              return (
                <div key={i}
                     className={`cday${c.out ? ' out' : ''}${c.wknd ? ' wknd' : ''}${c.date === todayIso ? ' now' : ''}`}
                     onClick={() => c.date && list.length && setDay(c.date)}
                     style={{ cursor: c.date && list.length ? 'pointer' : 'default' }}>
                  <div className="cn">{c.day}</div>
                  {list.slice(0, 3).map(e => (
                    <div className={`cev ${tone(e.status, String(e.due_date).slice(0, 10))}`} key={e.id}
                         title={`${e.title} - ${e.entity} (${e.status})`}>
                      {changedIds.has(e.id) ? '• ' : ''}{e.entity}: {e.title}
                    </div>
                  ))}
                  {list.length > 3 && (
                    <div className="tiny muted" style={{ paddingLeft: 4 }}>+{list.length - 3} more</div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="legend">
            <span><i style={{ background: 'var(--emerald-500)' }} />Approved</span>
            <span><i style={{ background: 'var(--indigo-500)' }} />In review</span>
            <span><i style={{ background: 'var(--amber-500)' }} />Open</span>
            <span><i style={{ background: 'var(--coral-500)' }} />Overdue or rejected</span>
            <span>• marks a revised due date</span>
          </div>
        </div></div>
      )}

      {!loading && (
        <div className="card mt16">
          <div className="card-b row g16 wrap tiny muted">
            <strong>Risk rating:</strong>
            <span className="row g6"><span className={`pill ${RISK_TONE.Critical}`}>Critical</span> statutory/financial exposure if missed - board-level attention</span>
            <span className="row g6"><span className={`pill ${RISK_TONE.High}`}>High</span> material penalty or licence risk</span>
            <span className="row g6"><span className={`pill ${RISK_TONE.Medium}`}>Medium</span> a fixed penalty or administrative consequence</span>
            <span className="row g6"><span className={`pill ${RISK_TONE.Low}`}>Low</span> limited consequence, but still a legal obligation</span>
          </div>
        </div>
      )}

      {!loading && view === 'list' && (
        <div className="card">
          <div className="tw">
            <table className="dt">
              <thead><tr>
                <th>Due</th><th>Compliance</th><th>Entity</th><th>Law</th>
                <th>Risk</th><th>Status</th>
              </tr></thead>
              <tbody>
                {listEvents.length === 0 && (
                  <tr><td colSpan={6}><div className="empty">
                    {dayFilter === 'all'
                      ? `Nothing falls due in ${MONTHS[month - 1]} ${year}.`
                      : `Nothing falls due ${dayFilter}.`}
                  </div></td></tr>
                )}
                {listEvents.map(e => (
                  <tr key={e.id} className="click"
                      onClick={() => { window.location.href = `/register?obligation=${e.id}`; }}>
                    <td className="num nowrap">{fmtDate(String(e.due_date))}
                      {changedIds.has(e.id) && <div className="t2" style={{ color: 'var(--warn-700)' }}>revised</div>}</td>
                    <td className="w"><div className="t1">{e.title}</div>
                      <div className="t2">{e.period_label}
                        {e.form_reference ? ` · ${e.form_reference}` : ''}
                        {e.jurisdiction ? ` · ${e.jurisdiction}` : ''}</div></td>
                    <td className="small nowrap">{e.entity}<div className="t2">{e.country_code}</div></td>
                    <td className="small">{e.category}</td>
                    <td><span className={`pill ${RISK_TONE[e.risk_level] ?? 'p-mute'}`}>{e.risk_level}</span></td>
                    <td><StatusPill s={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {day && (
        <Modal size="w" title={fmtDate(day)} sub={`${(byDay.get(day) ?? []).length} obligations falling due`}
               onClose={() => setDay(null)}
               footer={<button className="btn" onClick={() => setDay(null)}>Close</button>}>
          {(byDay.get(day) ?? []).map(e => (
            <div key={e.id} className="row between g8 wrap"
                 style={{ padding: '9px 0', borderBottom: '1px solid var(--line-2)' }}>
              <div className="grow">
                <div className="row g6 wrap">
                  <span className="strong small">{e.title}</span>
                  {changedIds.has(e.id) && <span className="pill p-warn nd tiny">due date revised</span>}
                </div>
                <div className="tiny muted mt4">
                  {e.entity} · {e.category} · {e.period_label}
                  {e.jurisdiction ? ` · ${e.jurisdiction}` : ''}
                </div>
              </div>
              <div className="row g6">
                <span className={`pill ${RISK_TONE[e.risk_level] ?? 'p-mute'}`}>{e.risk_level}</span>
                <StatusPill s={e.status} />
                <a className="btn btn-xs" href={`/register?obligation=${e.id}`}>Open</a>
              </div>
            </div>
          ))}
          {changes.filter(c => (byDay.get(day) ?? []).some(e => e.id === c.obligation_id)).map((c, i) => (
            <div className="mt12" key={i}>
              <Note kind="w">
                Revised from {fmtDate(c.old_due_date)} to <strong>{fmtDate(c.new_due_date)}</strong>
                {c.reason ? ` - ${c.reason}` : ''} ({fmtDateTime(c.changed_at)})
              </Note>
            </div>
          ))}
        </Modal>
      )}

      {uploadOpen && (
        <ImportModal kind="duedate" countries={countries}
                     onClose={() => setUploadOpen(false)}
                     onDone={() => { setUploadOpen(false); load(); }} />
      )}
    </>
  );
}
