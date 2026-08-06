'use client';
/* ===========================================================================
   Shared UI primitives. Deliberately small and explicit — no component library,
   so the interface has one consistent visual voice.
   =========================================================================== */
import React, { useEffect, useMemo, useState, useCallback, createContext, useContext } from 'react';

/* -------------------------------------------------------------- icons */
const P: Record<string, string> = {
  dash: 'M4 13h6V4H4v9zM14 20h6V4h-6v16zM4 20h6v-4H4v4z',
  building: 'M5 3.5h9v17H5zM14.5 9H19v11.5h-4.5M8 7.5h.01M11 7.5h.01M8 11h.01M11 11h.01M8 14.5h.01M11 14.5h.01',
  book: 'M5 4.5h5.5c1 0 1.5.5 1.5 1.5v14c0-1-1-1.5-2-1.5H5V4.5zM19 4.5h-5.5c-1 0-1.5.5-1.5 1.5v14c0-1 1-1.5 2-1.5H19V4.5z',
  list: 'M6 3.5h9l3.5 3.5v13A1.5 1.5 0 0 1 17 21.5H6A1.5 1.5 0 0 1 4.5 20V5A1.5 1.5 0 0 1 6 3.5zM14.5 3.5V7H18M7.5 11h8M7.5 14h8M7.5 17h5',
  cal: 'M4 5.5h16v15H4zM4 9.5h16M8 3.5v3M16 3.5v3',
  check2: 'M4.5 12.5l5 5 10-11',
  review: 'M10.5 4.5a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM15 15l5 5M8 10.5h5',
  report: 'M5 20V10M11 20V4M17 20v-7M3 20h18',
  gear: 'M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM19.4 13.5a7.6 7.6 0 0 0 0-3l1.6-1.2-1.5-2.6-1.9.6a7.5 7.5 0 0 0-2.6-1.5L14.6 3h-3l-.4 2.2a7.5 7.5 0 0 0-2.6 1.5l-1.9-.6-1.5 2.6L6.6 10a7.6 7.6 0 0 0 0 3L5 14.3l1.5 2.6 1.9-.6c.75.7 1.63 1.2 2.6 1.5l.4 2.2h3l.4-2.2a7.5 7.5 0 0 0 2.6-1.5l1.9.6 1.5-2.6-1.6-1.3z',
  upload: 'M12 15.5V4M8 8l4-4 4 4M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15',
  download: 'M12 4v11.5M8 11.5l4 4 4-4M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15',
  bell: 'M7 9.5a5 5 0 0 1 10 0c0 3 1 4.5 2 6H5c1-1.5 2-3 2-6zM9.5 18a2.5 2.5 0 0 0 5 0',
  search: 'M10.8 4.8a6 6 0 1 1 0 12 6 6 0 0 1 0-12zM20 20l-4.6-4.6',
  x: 'M6 6l12 12M18 6L6 18',
  chev: 'M8 10l4 4 4-4',
  chevR: 'M10 8l4 4-4 4',
  arrowR: 'M4 12h15M13 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  alert: 'M12 3.5l9 15.8H3L12 3.5zM12 10v3.5M12 16.7h.01',
  info: 'M12 3.8a8.2 8.2 0 1 1 0 16.4 8.2 8.2 0 0 1 0-16.4zM12 11v5.2M12 7.9h.01',
  clock: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM12 7.5V12l3.2 2',
  doc: 'M7 3.5h7l3 3v13.5A1.5 1.5 0 0 1 15.5 21.5h-8A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7 3.5zM13.5 3.5V7H17',
  users: 'M9.5 5.3a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4zM3.5 20c.9-3.3 3.4-5.2 6-5.2s5.1 1.9 6 5.2M16 5.6a3.2 3.2 0 0 1 0 5.9M17.5 14.9c2 .6 3.4 2.3 4 5.1',
  out: 'M10 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H10M15 16l4-4-4-4M19 12H9',
  menu: 'M4 7h16M4 12h16M4 17h16',
  filter: 'M4 5.5h16M7 12h10M10.2 18.5h3.6',
  edit: 'M4.5 19.5h4l10-10a2.1 2.1 0 0 0-3-3l-10 10v3zM14.5 5.5l3 3',
  trash: 'M4.5 7h15M9.5 7V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3V7M6.5 7l.9 12.2A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7',
  eye: 'M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  globe: 'M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM3.5 12h17M12 3.5c2.4 2.3 3.6 5.4 3.6 8.5s-1.2 6.2-3.6 8.5c-2.4-2.3-3.6-5.4-3.6-8.5S9.6 5.8 12 3.5z',
  shield: 'M12 3l7.5 3.2v5.4c0 5-3.3 8-7.5 9.4-4.2-1.4-7.5-4.4-7.5-9.4V6.2L12 3zM9 12l2.2 2.2L15.4 10',
  send: 'M20 4L3.5 11l6.5 2.2L12.5 20 20 4zM10 13.2L20 4',
  sheet: 'M4 4.5h16v15H4zM4 9.5h16M9 9.5v10M14 9.5v10',
  swap: 'M4 8h13l-3-3M20 16H7l3 3',
  back: 'M19 12H5M11 6l-6 6 6 6',
};

export function Ic({ n, s = 16, c }: { n: string; s?: number; c?: string }) {
  const d = P[n] ?? P.info;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c ?? 'currentColor'}
         strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
         style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  );
}

/* -------------------------------------------------------------- helpers */
export const STATUS_TONE: Record<string, string> = {
  'Approved': 'p-ok',
  'Submitted': 'p-info',
  'Under Review': 'p-info',
  'Query Raised': 'p-warn',
  'Rejected': 'p-bad',
  'Overdue': 'p-bad',
  'Evidence Pending': 'p-warn',
  'Not Started': 'p-mute',
  'Not Applicable': 'p-mute',
};
export const RISK_TONE: Record<string, string> = {
  Critical: 'p-bad', High: 'p-bad', Medium: 'p-warn', Low: 'p-mute',
};

export function Pill({ children, tone = 'p-mute', nd }: { children: React.ReactNode; tone?: string; nd?: boolean }) {
  return <span className={`pill ${tone}${nd ? ' nd' : ''}`}>{children}</span>;
}
export function StatusPill({ s }: { s: string }) {
  return <Pill tone={STATUS_TONE[s] ?? 'p-mute'}>{s}</Pill>;
}

export function scoreColor(v: number): string {
  if (v >= 90) return '#1B7A50';
  if (v >= 80) return '#4F8F5F';
  if (v >= 70) return '#B06E0C';
  if (v >= 55) return '#C9761A';
  return '#C22A36';
}

const UI_MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** DD-MMM-YYYY, e.g. 04-Aug-2026 — the house date format for this deployment. */
export function fmtDate(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v.length === 10 ? v + 'T00:00:00Z' : v);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day}-${UI_MON_SHORT[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}
export function fmtDateTime(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day}-${UI_MON_SHORT[d.getMonth()]}-${d.getFullYear()}, ${time}`;
}
export function daysFromToday(v?: string | null): number | null {
  if (!v) return null;
  const d = new Date(v.length === 10 ? v + 'T00:00:00Z' : v);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  const t = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((d.getTime() - t) / 86_400_000);
}
export function fmtBytes(n: number): string {
  if (!n) return '0 KB';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}
export function initials(n: string): string {
  return n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/* -------------------------------------------------------------- toasts */
type Toast = { id: number; msg: string; kind?: string };
const ToastCtx = createContext<(msg: string, kind?: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind?: string) => {
    const id = Date.now() + Math.random();
    setList(l => [...l, { id, msg, kind }]);
    setTimeout(() => setList(l => l.filter(t => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        {list.map(t => <div key={t.id} className={`toast ${t.kind ?? ''}`}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

/* -------------------------------------------------------------- modal */
export function Modal({ title, sub, onClose, children, footer, size }: {
  title: string; sub?: string; onClose: () => void;
  children: React.ReactNode; footer?: React.ReactNode; size?: 'w' | 'xw';
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="mask" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${size ?? ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-h">
          <div>
            {sub && <div className="cap mb4">{sub}</div>}
            <h2>{title}</h2>
          </div>
          <button className="x" onClick={onClose} aria-label="Close"><Ic n="x" s={18} /></button>
        </div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- data table */
export type Col<T> = {
  key: string;
  label: string;
  sort?: boolean;
  cls?: string;
  width?: string;
  render?: (r: T) => React.ReactNode;
  value?: (r: T) => string | number;
};

export function DataTable<T extends Record<string, unknown>>({
  rows, cols, onRow, empty, pageSize = 40, rowKey,
}: {
  rows: T[]; cols: Col<T>[]; onRow?: (r: T) => void; empty?: string;
  pageSize?: number; rowKey: (r: T, i: number) => string;
}) {
  const [sk, setSk] = useState<string | null>(null);
  const [sd, setSd] = useState(1);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [rows.length]);

  const sorted = useMemo(() => {
    if (!sk) return rows;
    const col = cols.find(c => c.key === sk);
    const val = (r: T) => {
      if (col?.value) return col.value(r);
      const v = r[sk];
      return typeof v === 'number' ? v : String(v ?? '');
    };
    return [...rows].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sd;
      return String(av).localeCompare(String(bv)) * sd;
    });
  }, [rows, sk, sd, cols]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(page, pages);
  const slice = sorted.slice((cur - 1) * pageSize, cur * pageSize);

  return (
    <>
      <div className="tw">
        <table className="dt">
          <thead>
            <tr>{cols.map(c => (
              <th key={c.key}
                  className={`${c.sort ? 's' : ''} ${sk === c.key ? (sd === 1 ? 'asc' : 'desc') : ''}`}
                  style={c.width ? { width: c.width } : undefined}
                  onClick={c.sort ? () => { if (sk === c.key) setSd(d => -d); else { setSk(c.key); setSd(1); } } : undefined}>
                {c.label}
              </th>))}
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr><td colSpan={cols.length}><div className="empty">{empty ?? 'No records match the current filters.'}</div></td></tr>
            )}
            {slice.map((r, i) => (
              <tr key={rowKey(r, i)} className={onRow ? 'click' : undefined}
                  onClick={onRow ? () => onRow(r) : undefined}>
                {cols.map(c => (
                  <td key={c.key} className={c.cls}>
                    {c.render ? c.render(r) : String(r[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="card-f row between no-print">
          <span className="small muted">
            {(cur - 1) * pageSize + 1}–{Math.min(cur * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="row g6">
            <button className="btn btn-xs" disabled={cur === 1} onClick={() => setPage(cur - 1)}>Previous</button>
            <span className="small muted num">{cur} / {pages}</span>
            <button className="btn btn-xs" disabled={cur === pages} onClick={() => setPage(cur + 1)}>Next</button>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------- score dial */
export function Dial({ value, size = 92, label = 'SCORE' }: { value: number; size?: number; label?: string }) {
  const r = 34, c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="dial" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 84 84">
        <circle cx="42" cy="42" r={r} fill="none" stroke="var(--line-2)" strokeWidth="7" />
        <circle cx="42" cy="42" r={r} fill="none" stroke={scoreColor(v)} strokeWidth="7"
                strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (v / 100) * c}
                transform="rotate(-90 42 42)" />
      </svg>
      <div className="dv">
        <span className="dn">{v.toFixed(1)}</span>
        <span className="dl">{label}</span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- misc */
export function Kpi({ label, value, sub, bar, barColor }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; bar?: number; barColor?: string;
}) {
  return (
    <div className="card kpi">
      <div className="kl">{label}</div>
      <div className="kv">{value}</div>
      {sub && <div className="ks">{sub}</div>}
      {bar != null && (
        <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, bar))}%`, background: barColor ?? scoreColor(bar) }} /></div>
      )}
    </div>
  );
}

export function Note({ kind = 'i', children }: { kind?: 'i' | 'w' | 'b' | 'o'; children: React.ReactNode }) {
  const icon = kind === 'b' ? 'alert' : kind === 'w' ? 'alert' : kind === 'o' ? 'check2' : 'info';
  return (
    <div className={`note note-${kind}`}>
      <span style={{ marginTop: 1 }}><Ic n={icon} s={15} /></span>
      <div>{children}</div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="row g8 muted small" style={{ padding: '18px 0' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" style={{ animation: 'spin .8s linear infinite' }}>
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--line)" strokeWidth="3" />
        <path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="var(--navy-700)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {label ?? 'Loading…'}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export function ValidationChecks({ v }: { v: { outcome?: string; checks?: { key: string; label: string; result: string; detail: string }[] } | null }) {
  if (!v || !v.checks?.length) return <div className="small muted">Validation has not run on this document.</div>;
  const mark = (r: string) => r === 'pass' ? '✓' : r === 'fail' ? '✕' : r === 'warn' ? '!' : 'i';
  return (
    <div>
      {v.checks.map(c => (
        <div className="chk" key={c.key}>
          <span className={`ci ${c.result}`}>{mark(c.result)}</span>
          <div>
            <div className="cl">{c.label}</div>
            <div className="cd">{c.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* download helper used by every export button */
export async function downloadFile(url: string, fallbackName: string, toast?: (m: string, k?: string) => void) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error((await res.json().catch(() => ({ error: 'Export failed' }))).error);
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') ?? '';
    const m = cd.match(/filename="?([^";]+)"?/);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = m ? m[1] : fallbackName;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast?.('Download started', 'ok');
  } catch (e) {
    toast?.(e instanceof Error ? e.message : 'Export failed', 'bad');
  }
}
