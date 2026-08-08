import Link from 'next/link';
import { Ic } from '@/components/ui';

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

/* A restrained, brand-coloured abstract mark for the hero - a shield of
   compliance built from the same document/checkmark motifs used through the
   product, so the landing page reads as considered rather than bare text. */
function HeroMark() {
  return (
    <svg width={280} height={280} viewBox="0 0 280 280" fill="none" aria-hidden="true">
      <circle cx="140" cy="140" r="132" fill="var(--navy-050)" />
      <circle cx="140" cy="140" r="104" fill="var(--surface)" stroke="var(--line)" />
      <g transform="translate(72,54)">
        <rect x="0" y="14" width="92" height="118" rx="6" fill="var(--info-100)" stroke="var(--info-700)" strokeWidth="1.4" />
        <rect x="18" y="0" width="92" height="118" rx="6" fill="var(--surface)" stroke="var(--navy-700)" strokeWidth="1.6" />
        <path d="M30 26h68M30 42h68M30 58h44" stroke="var(--line)" strokeWidth="4" strokeLinecap="round" />
        <circle cx="98" cy="98" r="30" fill="var(--red-600)" />
        <path d="M85 98l9 9 18-18" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="land">
      <header className="land-nav">
        <div className="row g12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://www.lmwglobal.com/images/lmw-logo.png" alt="LMW"
               style={{ height: 27, width: 'auto' }} />
          <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--navy-900)' }}>
              LMW Compliance Management Platform
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

      <section className="land-hero row g24 wrap" style={{ alignItems: 'center' }}>
        <div style={{ maxWidth: 640, flex: '1 1 480px' }}>
          <div className="cap mb12" style={{ color: 'var(--red-600)' }}>Version 1.2</div>
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

        <div className="no-print" style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'center', minWidth: 260 }}>
          <HeroMark />
        </div>
      </section>

      <div className="land-hero" style={{ paddingTop: 0 }}>
        <div className="grid g-4">
          {[
            ['Entities in scope', '2', 'LMW Limited (India) and LMW Global FZE (UAE)'],
            ['Statutory obligations', '95+', 'National plus Tamil Nadu / UAE free-zone level'],
            ['Evidence held', 'Every filing', 'Versioned, checksummed, downloadable'],
            ['Score basis', 'Approved only', 'Self-declaration does not count'],
          ].map(([l, v, s]) => (
            <div className="card kpi" key={l}>
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
          <div className="grid g-5">
            {FLOW.map(f => (
              <div className="card card-b" key={f.n}>
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
          <div className="grid g-3">
            {MODULES.map(m => {
              const tint = TINTS[m.tint];
              return (
                <div className="card card-b" key={m.t}>
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
            LMW Compliance Management Platform · Version 1.2 · Internal use only
          </span>
          <Link href="/signin" className="tiny strong">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
