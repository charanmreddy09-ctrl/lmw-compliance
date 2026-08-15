'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Ic } from '@/components/ui';
import { prefersReducedMotion } from '@/components/ui2';

/* The landing page deliberately carries no credential fields. Signing in is a
   separate route so the front door stays a plain description of the platform. */

const MODULES = [
  { t: 'Dashboard', icon: 'report', tint: 'navy',
    d: 'Group and country compliance score, exposure and workload in one view, scoped to the role that is signed in.' },
  { t: 'Entities', icon: 'building', tint: 'info',
    d: 'Every legal entity and division with its own scorecard, applicable jurisdictions and full obligation register.' },
  { t: 'Compliance Library', icon: 'book', tint: 'ok',
    d: 'The master list of statutory obligations applicable to each entity, organised by country and by state.' },
  { t: 'Compliance Calendar', icon: 'cal', tint: 'warn',
    d: 'Entity-specific statutory due dates, kept current as filing deadlines are notified or revised.' },
  { t: 'Reviews', icon: 'review', tint: 'red',
    d: 'Filed returns arrive in the reviewer’s queue. Approve, reject, raise a query, reassign or escalate - every decision recorded.' },
  { t: 'Reports', icon: 'sheet', tint: 'navy',
    d: 'Country, entity, division, overdue, delay and evidence reports, exportable to Excel or PDF for the Board.' },
  { t: 'Administration', icon: 'gear', tint: 'info',
    d: 'User access, entity assignment, delegated review authority and the complete audit trail, in one place.' },
];

const TINTS: Record<string, { bg: string; fg: string }> = {
  navy: { bg: 'var(--navy-100)', fg: 'var(--navy-700)' },
  red:  { bg: 'var(--red-100)',  fg: 'var(--red-700)' },
  ok:   { bg: 'var(--ok-100)',   fg: 'var(--ok-700)' },
  info: { bg: 'var(--info-100)', fg: 'var(--info-700)' },
  warn: { bg: 'var(--warn-100)', fg: 'var(--warn-700)' },
};

const FLOW = [
  { n: '01', t: 'Obligation identified', d: 'Every statutory filing applicable to an entity is identified automatically from its country, state and registration details.' },
  { n: '02', t: 'Filed with evidence', d: 'The responsible officer files the return and attaches the supporting document for that specific period.' },
  { n: '03', t: 'Validated automatically', d: 'Filing period, due date, delay and required supporting documents are checked before a reviewer ever sees it.' },
  { n: '04', t: 'Reviewed', d: 'The filing moves into the reviewer’s queue. A query is returned to the preparer with the reason recorded.' },
  { n: '05', t: 'Scored', d: 'Only approved filings, each backed by evidence, count toward the compliance score - the number cannot be self-declared.' },
];

/* Auto-rotating "how it works / why it matters" slides for the hero, replacing
   a single static graphic so a first-time visitor sees the platform's key
   ideas without having to scroll - advances on its own, pauses under
   prefers-reduced-motion (dots remain clickable either way). */
const HERO_SLIDES = [
  { icon: 'report', tint: 'navy', t: 'A live compliance score', d: 'Every entity carries a real-time score derived from actual filings, not a self-declared checklist.' },
  { icon: 'book', tint: 'info', t: 'Evidence-backed, always', d: 'Each obligation is only marked filed once the supporting document is attached and versioned.' },
  { icon: 'review', tint: 'red', t: 'Independent review', d: 'A filing only counts toward the score after a reviewer approves it - queries and rejections are recorded.' },
  { icon: 'cal', tint: 'warn', t: 'A calendar that knows your entities', d: 'Statutory due dates are scoped to each entity’s actual country, state and free-zone registration.' },
  { icon: 'sheet', tint: 'ok', t: 'Board-ready reporting', d: 'Country, entity, overdue and delay reports export in one click - built from the underlying record, not a summary email.' },
] as const;

function HeroSlideshow() {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => setI(v => (v + 1) % HERO_SLIDES.length), 4200);
    return () => clearInterval(id);
  }, []);

  const s = HERO_SLIDES[i];
  const tint = TINTS[s.tint];

  return (
    <div className="hero-slides no-print">
      <div key={i} className="hero-slide">
        <span className="hero-slide-ic" style={{ background: tint.bg }}>
          <Ic n={s.icon} s={30} c={tint.fg} />
        </span>
        <h3 className="mt16 mb4">{s.t}</h3>
        <p className="small muted mt0 mb0" style={{ lineHeight: 1.55 }}>{s.d}</p>
      </div>
      <div className="hero-slide-dots">
        {HERO_SLIDES.map((_, n) => (
          <button key={n} type="button" aria-label={`Slide ${n + 1}`}
                  className={n === i ? 'on' : ''} onClick={() => setI(n)} />
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="land">
      <header className="land-nav">
        <div className="row g12">
          <span style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: 8, background: '#112424', flexShrink: 0, padding: 4,
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mca-logo.png" alt="MCA Compliance 360" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </span>
          <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--navy-900)' }}>
              MCA Compliance 360
            </div>
            <div className="cap" style={{ fontSize: 9.5 }}>Statutory compliance control tower</div>
          </div>
        </div>
        <nav className="row g16">
          <a href="#how" className="small strong" style={{ color: 'var(--ink-2)' }}>How it works</a>
          <a href="#modules" className="small strong" style={{ color: 'var(--ink-2)' }}>Modules</a>
          <a href="#coverage" className="small strong" style={{ color: 'var(--ink-2)' }}>Coverage</a>
          <Link href="/signin" className="btn btn-p btn-s">Sign in</Link>
        </nav>
      </header>

      <section className="land-hero row g24 wrap stagger-in stagger-1" style={{ alignItems: 'center' }}>
        <div style={{ maxWidth: 640, flex: '1 1 480px' }}>
          <div className="cap mb12" style={{ color: 'var(--red-600)' }}>Version 1.3</div>
          <h1 style={{ fontSize: 34, lineHeight: 1.18, letterSpacing: '-0.02em' }}>
            Statutory compliance the Board can rely on, because every entry is
            backed by the document that proves it.
          </h1>
          <p className="mt16" style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            The platform replaces the representation letter. Instead of asking each
            entity to confirm that it complied, it holds the filing, the evidence and
            the reviewer’s decision - and derives a live compliance score for every
            entity from that record.
          </p>
          <div className="row g8 mt24 wrap">
            <Link href="/signin" className="btn btn-p">Sign in to the platform</Link>
            <a href="#how" className="btn">See the workflow</a>
          </div>
        </div>

        <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'center', minWidth: 260 }}>
          <HeroSlideshow />
        </div>
      </section>

      <div className="land-hero" style={{ paddingTop: 0 }}>
        <div className="grid g-4 stagger-in stagger-2">
          {[
            ['Entities supported', 'Unlimited', 'Every legal entity, in every country you operate in'],
            ['Statutory obligations', '95+', 'National plus Tamil Nadu / UAE free-zone level'],
            ['Evidence held', 'Every filing', 'Versioned, checksummed, downloadable'],
            ['Score basis', 'Approved only', 'Self-declaration does not count'],
          ].map(([l, v, s]) => (
            <div className="card kpi hoverable" key={l}>
              <div className="kl">{l}</div>
              <div className="kv-num">{v}</div>
              <div className="ks">{s}</div>
            </div>
          ))}
        </div>
      </div>

      <section id="how" style={{ background: 'var(--canvas)', borderTop: '1px solid var(--line)', padding: '44px 26px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div className="cap mb8">How a filing moves through the platform</div>
          <h2 style={{ fontSize: 22, marginBottom: 22 }}>From obligation to Board-level score, with a full audit trail</h2>
          <div className="grid g-5 stagger-in stagger-1">
            {FLOW.map(f => (
              <div className="card card-b hoverable" key={f.n}>
                <div className="num" style={{ fontSize: 20, color: 'var(--red-600)', fontWeight: 500 }}>{f.n}</div>
                <h3 className="mt8">{f.t}</h3>
                <p className="small muted mt4 mb0" style={{ lineHeight: 1.55 }}>{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="modules" style={{ padding: '44px 26px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div className="cap mb8">Platform capabilities</div>
          <h2 style={{ fontSize: 22, marginBottom: 22 }}>Everything the compliance function needs, in one system of record</h2>
          <div className="grid g-3 stagger-in stagger-1">
            {MODULES.map(m => {
              const tint = TINTS[m.tint];
              return (
                <div className="card card-b hoverable" key={m.t}>
                  <div className="row g10" style={{ alignItems: 'center', marginBottom: 10 }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 34, height: 34, borderRadius: '50%', background: tint.bg, flexShrink: 0,
                    }}>
                      <Ic n={m.icon} s={17} c={tint.fg} />
                    </span>
                    <h3 style={{ margin: 0 }}>{m.t}</h3>
                  </div>
                  <p className="small muted mt0 mb0" style={{ lineHeight: 1.55 }}>{m.d}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="coverage" style={{ background: 'var(--canvas)', borderTop: '1px solid var(--line)', padding: '44px 26px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div className="cap mb8">Coverage</div>
          <h2 style={{ fontSize: 22, marginBottom: 8 }}>Two countries today, with sub-national depth where it matters</h2>
          <p className="small muted mb16" style={{ maxWidth: 720 }}>
            A state or free-zone obligation applies to an entity only where that entity is
            actually registered, so a Tamil Nadu filing never appears against an entity that
            does not operate there. Additional countries, states or entities can be added as
            the group’s footprint grows.
          </p>
          <div className="card">
            <div className="tw">
              <table className="dt">
                <thead>
                  <tr><th>Country</th><th>Sub-national levels maintained</th><th>Typical scope</th></tr>
                </thead>
                <tbody>
                  {[
                    ['India', 'Tamil Nadu', 'Central corporate law, tax, GST, SEBI/LODR and FEMA, plus state professional tax, labour welfare, factory licence, boiler certificate and pollution control'],
                    ['United Arab Emirates', 'Dubai free zone', 'Federal VAT, Corporate Tax, Economic Substance and UBO filings, plus free-zone trade licence, immigration and financial statement filings'],
                  ].map(r => (
                    <tr key={r[0]}>
                      <td className="strong nowrap">{r[0]}</td>
                      <td className="small">{r[1]}</td>
                      <td className="small muted w">{r[2]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="tiny muted mt12" style={{ maxWidth: 760 }}>
            Every statutory reference is reviewed and signed off by a qualified local adviser
            before it is relied upon. This platform supports, and does not replace,
            professional legal and tax advice.
          </p>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--line)', padding: '18px 26px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }} className="row between wrap g12">
          <span className="tiny muted">
            MCA Compliance 360 · Version 1.3 · Internal use only
          </span>
          <Link href="/signin" className="tiny strong">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
