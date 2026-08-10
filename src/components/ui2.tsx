'use client';
/* ===========================================================================
   v1.3 REDESIGN — additive visual primitives.
   ---------------------------------------------------------------------------
   Kept deliberately separate from ui.tsx rather than merged into it: ui.tsx
   is a single file with no export namespacing, edited by whichever change
   needs a shared component next, and this redesign's first goal is to not
   collide with that. These primitives import tone/format helpers from ui.tsx
   rather than redefining them, and can be folded back into ui.tsx once the
   redesign has shipped and settled.
   =========================================================================== */
import React, { useEffect, useRef, useState } from 'react';
import { Ic, scoreColor, initials, type TrailEntry } from './ui';

/* ------------------------------------------------------------- reduced motion */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/* ------------------------------------------------------------------ count-up
   rAF-driven, snaps instantly for reduced-motion. Animates once per mount of
   the component holding it - callers that want it to replay on data change
   replays from its own previous value whenever `target` actually changes -
   first mount counts up from 0, a later refresh that lands on a different
   number counts from the old figure to the new one, and a refresh that
   lands on the same number does nothing (no needless replay). */
export function useCountUp(target: number, opts?: { duration?: number; decimals?: number }): number {
  const duration = opts?.duration ?? 900;
  const decimals = opts?.decimals ?? 0;
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0);
  const prevTarget = useRef<number | null>(prefersReducedMotion() ? target : null);

  useEffect(() => {
    if (prefersReducedMotion()) { setValue(target); prevTarget.current = target; return; }
    const from = prevTarget.current ?? 0;
    if (from === target) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else { setValue(target); prevTarget.current = target; }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return Number(value.toFixed(decimals));
}

export function AnimatedNumber({ value, decimals = 0, suffix = '', prefix = '' }: {
  value: number; decimals?: number; suffix?: string; prefix?: string;
}) {
  const v = useCountUp(value, { decimals });
  return <span className="num">{prefix}{v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
}

/* --------------------------------------------------------------------------
   reveal-on-scroll: adds .visible to trigger the .reveal-in CSS transition
   the first time the element enters the viewport. */
export function useRevealOnScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(prefersReducedMotion());

  useEffect(() => {
    if (prefersReducedMotion() || !ref.current) { setVisible(true); return; }
    const el = ref.current;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold: 0.15 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return { ref, visible };
}

/* ------------------------------------------------------------------ ProgressRing
   Animated-arc upgrade of Gauge/Dial. Plain mode: single value 0-100.
   Segmented mode: stacked arcs (e.g. Approved/Due soon/Overdue) that sum to
   the ring's total, each independently hoverable. */
export type RingSegment = { key: string; value: number; color: string; label: string };

export function ProgressRing({
  value, size = 168, strokeWidth = 12, segments, onSegmentHover, sweep = 0.75, center,
}: {
  value: number; size?: number; strokeWidth?: number; sweep?: number;
  segments?: RingSegment[]; onSegmentHover?: (seg: RingSegment | null) => void;
  center?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(t); }, []);
  const r = (size - strokeWidth) / 2;
  const C = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  const reduce = prefersReducedMotion();
  const cx = size / 2, cy = size / 2;
  const total = segments?.reduce((s, seg) => s + seg.value, 0) ?? 0;

  let offsetAcc = 0;

  return (
    <div className="ring-wrap" style={{ width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line-2)" strokeWidth={strokeWidth}
                strokeLinecap="round" strokeDasharray={`${sweep * C} ${C}`}
                transform={`rotate(${135} ${cx} ${cy})`} />
        {segments && total > 0 ? segments.map(seg => {
          const frac = seg.value / total;
          const dash = sweep * C * frac;
          const rotate = 135 + (offsetAcc / total) * sweep * 360;
          offsetAcc += seg.value;
          return (
            <path key={seg.key} className="ring-seg"
                  d={describeArcPath(cx, cy, r)}
                  fill="none" stroke={seg.color} strokeWidth={strokeWidth} strokeLinecap="butt"
                  strokeDasharray={`${mounted || reduce ? dash : 0} ${C}`}
                  transform={`rotate(${rotate} ${cx} ${cy})`}
                  style={{ transition: reduce ? 'none' : `stroke-dasharray ${0.9 + offsetAcc / total * 0.3}s cubic-bezier(.16,1,.3,1)` }}
                  onMouseEnter={() => onSegmentHover?.(seg)}
                  onMouseLeave={() => onSegmentHover?.(null)} />
          );
        }) : (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={scoreColor(v)} strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={`${mounted || reduce ? sweep * C * (v / 100) : 0} ${C}`}
                  transform={`rotate(135 ${cx} ${cy})`}
                  style={{ transition: reduce ? 'none' : 'stroke-dasharray 1s cubic-bezier(.16,1,.3,1)' }} />
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 2, textAlign: 'center',
      }}>
        {center}
      </div>
    </div>
  );
}
/** A full circle path so strokeDasharray can carve an arc out of it — simpler
    than computing per-segment start/end points by hand. */
function describeArcPath(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy}`;
}

/* ------------------------------------------------------------------ skeletons */
export function Skeleton({ w, h, className, radius }: { w?: number | string; h?: number | string; className?: string; radius?: number }) {
  return <div className={`skel ${className ?? ''}`} style={{ width: w ?? '100%', height: h ?? 14, borderRadius: radius }} />;
}
export function SkeletonText({ lines = 2, width = '100%' }: { lines?: number; width?: string | string[] }) {
  const widths = Array.isArray(width) ? width : Array.from({ length: lines }, () => width);
  return <div>{Array.from({ length: lines }, (_, i) => (
    <div key={i} className="skel skel-text" style={{ width: widths[i] ?? '100%' }} />
  ))}</div>;
}
export function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <div className="card skel-card" style={{ height }}>
      <div className="card-b">
        <div className="skel skel-title" />
        <SkeletonText lines={2} width={['90%', '60%']} />
      </div>
    </div>
  );
}
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card">
      <div className="card-b" style={{ display: 'grid', gap: 10 }}>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
            {Array.from({ length: cols }, (_, c) => <div key={c} className="skel skel-text" style={{ width: c === 0 ? '80%' : '60%' }} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ empty state */
export function EmptyState({ icon, title, body, action }: {
  icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode;
}) {
  return (
    <div className="empty2">
      {icon ?? <IllustrationEmptyList />}
      <h4>{title}</h4>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

const ILL_STROKE = 'var(--navy-500)';
const ILL_FILL = 'var(--navy-050)';

export function IllustrationEmptyInbox({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <rect x="14" y="26" width="68" height="48" rx="8" fill={ILL_FILL} />
      <path d="M14 34 L42 54 a10 10 0 0 0 12 0 L82 34" stroke={ILL_STROKE} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="14" y="26" width="68" height="48" rx="8" stroke={ILL_STROKE} strokeWidth="2.5" fill="none" />
      <circle cx="70" cy="24" r="10" fill="var(--navy-100)" />
      <path d="M66 24h8M70 20v8" stroke="var(--navy-600)" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
export function IllustrationEmptyList({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <rect x="20" y="14" width="44" height="60" rx="6" fill={ILL_FILL} stroke={ILL_STROKE} strokeWidth="2.5" />
      <path d="M30 30h24M30 40h24M30 50h16" stroke={ILL_STROKE} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="66" cy="62" r="16" fill="var(--surface)" stroke="var(--navy-300, var(--navy-200))" strokeWidth="2.5" />
      <path d="M60 62h12M66 56v12" stroke="var(--ink-4)" strokeWidth="2.5" strokeLinecap="round" transform="rotate(45 66 62)" />
    </svg>
  );
}
export function IllustrationAllClear({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <path d="M48 12l26 11v19c0 18-11 29-26 33-15-4-26-15-26-33V23l26-11z" fill="var(--ok-100)" stroke="var(--ok-600)" strokeWidth="2.5" />
      <path d="M36 46l9 9 16-18" stroke="var(--ok-700)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ timeline v2 */
const TL_META: Record<string, { icon: string; tone: '' | 'ok' | 'bad' | 'warn' }> = {
  submit: { icon: 'upload', tone: '' }, resubmit: { icon: 'swap', tone: '' },
  approve: { icon: 'check2', tone: 'ok' }, reject: { icon: 'x', tone: 'bad' },
  query: { icon: 'alert', tone: 'warn' }, escalate: { icon: 'arrowR', tone: 'bad' },
  reopen: { icon: 'swap', tone: 'warn' }, reassign: { icon: 'users', tone: '' },
  comment: { icon: 'doc', tone: '' },
};
const TL_LABEL: Record<string, string> = {
  submit: 'Evidence submitted', resubmit: 'Resubmitted', approve: 'Approved', reject: 'Rejected',
  query: 'Query raised', escalate: 'Escalated', reopen: 'Reopened', reassign: 'Reassigned', comment: 'Comment',
};

export function TimelineV2({ items, limit }: { items: TrailEntry[]; limit?: number }) {
  if (!items.length) return <EmptyState icon={<IllustrationEmptyInbox size={72} />} title="Nothing yet" body="No activity has been recorded here." />;
  const rows = limit ? items.slice(-limit) : items;
  return (
    <div className="tl2">
      {rows.map(t => {
        const m = TL_META[t.action] ?? { icon: 'info', tone: '' as const };
        return (
          <div className="tl2-item" key={t.id}>
            <div className={`tl2-node ${m.tone}`}><Ic n={m.icon} s={13} /></div>
            <div className="tl2-body">
              <div className="row g6 wrap">
                <span className="small strong">{TL_LABEL[t.action] ?? t.action}</span>
                {t.to_status && t.from_status && t.from_status !== t.to_status && (
                  <span className="tiny dim">{t.from_status} <Ic n="arrowR" s={10} /> {t.to_status}</span>
                )}
              </div>
              <div className="tiny muted mt4">
                {t.actor && <span className="tl2-avatar">{initials(t.actor)}</span>}
                {t.actor ?? 'System'}{t.actor_role ? ` · ${t.actor_role}` : ''}
              </div>
              {t.comment && (
                <div className="small mt4" style={{ borderLeft: '2px solid var(--line)', paddingLeft: 8, color: 'var(--ink-2)' }}>
                  {t.comment}
                </div>
              )}
              <div className="tl-m mt4">{new Date(t.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} IST</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ badge v2 */
export function BadgeV2({ tone = 'mute', children, pulse }: {
  tone?: 'ok' | 'warn' | 'bad' | 'info' | 'mute'; children: React.ReactNode; pulse?: boolean;
}) {
  const dotColor: Record<string, string> = {
    ok: 'var(--ok-600)', warn: 'var(--warn-600)', bad: 'var(--bad-600)', info: 'var(--info-600)', mute: 'var(--ink-4)',
  };
  return (
    <span className={`badge2 badge2-${tone}${pulse ? ' pulse' : ''}`}>
      <span className="dot" style={{ background: dotColor[tone], color: dotColor[tone] }} />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ stepper */
export type StepState = 'done' | 'active' | 'pending';
export type StepperStep = { id: string; label: string; state: StepState; tone?: 'ok' | 'bad'; caption?: string };

export function Stepper({ steps }: { steps: StepperStep[] }) {
  return (
    <div className="stepper">
      {steps.map(s => (
        <div key={s.id} className={`stepper-step ${s.state}${s.tone === 'bad' ? ' bad' : ''}`}>
          <div className="line" />
          <div className="node">
            {s.state === 'done'
              ? <Ic n={s.tone === 'bad' ? 'x' : 'check2'} s={13} c="#fff" />
              : <span style={{ fontSize: 10, fontWeight: 700 }}>{steps.indexOf(s) + 1}</span>}
          </div>
          <div className="lbl">{s.label}</div>
          {s.caption && <div className="cap">{s.caption}</div>}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ page transition
   CSS-only fade+rise, keyed by the caller on the current pathname so each
   navigation re-triggers the animation exactly once. */
export function PageTransition({ pathKey, children }: { pathKey: string; children: React.ReactNode }) {
  return <div key={pathKey} className="page-fade">{children}</div>;
}

/* ------------------------------------------------------------------ quick tiles */
export function QuickTile({ icon, label, onClick, href }: { icon: string; label: string; onClick?: () => void; href?: string }) {
  const body = <><span className="qi"><Ic n={icon} s={17} /></span><span className="ql">{label}</span></>;
  if (href) return <a href={href} className="qa-tile">{body}</a>;
  return <button className="qa-tile" onClick={onClick} type="button">{body}</button>;
}
