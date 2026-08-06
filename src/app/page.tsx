import Link from 'next/link';

/* The landing page deliberately carries no credential fields. Signing in is a
   separate route so the front door stays a plain description of the platform. */

const MODULES = [
  { t: 'Dashboard', d: 'Group and country compliance score, exposure and workload in one view, scoped to the role that is signed in.' },
  { t: 'Entities', d: 'Every legal entity and division with its own scorecard, applicable jurisdictions and full obligation register.' },
  { t: 'Compliance library', d: 'The statutory master list. Maintained in the application or imported from Excel, per country and per state.' },
  { t: 'Compliance calendar', d: 'Entity-specific due dates. Upload revised dates from Excel and every dashboard, task and report updates at once.' },
  { t: 'Reviews', d: 'Uploaded filings arrive in the reviewer’s queue. Approve, reject, raise a query, reassign or escalate — all recorded.' },
  { t: 'Reports', d: 'Country, entity, division, overdue, delay, evidence and reviewer reports. Export to Excel or print to PDF.' },
  { t: 'Administration', d: 'Create logins by email address, approve them, assign entities, delegate review authority, inspect the audit trail.' },
];

const FLOW = [
  { n: '01', t: 'Obligation raised', d: 'The library and the entity’s registered jurisdictions decide what applies. Nothing is typed twice.' },
  { n: '02', t: 'Filed with evidence', d: 'The responsible person uploads the filing and its supporting documents against the specific period.' },
  { n: '03', t: 'Validated automatically', d: 'Period, filing date against due date, delay, penalty exposure, required documents and duplicates are all checked before a human looks.' },
  { n: '04', t: 'Reviewed', d: 'It lands in the reviewer’s portal. A query returns it to the preparer with the reason attached.' },
  { n: '05', t: 'Scored', d: 'Only approved, evidence-backed obligations lift the compliance score. The number cannot be self-declared.' },
];

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

      <section className="land-hero">
        <div style={{ maxWidth: 720 }}>
          <div className="cap mb12" style={{ color: 'var(--red-600)' }}>Version 1.0</div>
          <h1 style={{ fontSize: 34, lineHeight: 1.18, letterSpacing: '-0.02em' }}>
            Statutory compliance the Board can rely on, because every entry is
            backed by the document that proves it.
          </h1>
          <p className="mt16" style={{ fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            The platform replaces the representation letter. Instead of asking each
            country to confirm that it complied, it holds the filing, the evidence and
            the reviewer’s decision — and derives a live compliance score for every
            entity from that record.
          </p>
          <div className="row g8 mt24 wrap">
            <Link href="/signin" className="btn btn-p">Sign in to the platform</Link>
            <a href="#how" className="btn">See the workflow</a>
          </div>
        </div>

        <div className="grid g-4 mt24" style={{ marginTop: 40 }}>
          {[
            ['Entities in scope', '2', 'LMW Limited (India) and LMW Global FZE (UAE)'],
            ['Statutory obligations', '40+', 'National plus Tamil Nadu / UAE free-zone level — starting baseline'],
            ['Evidence held', 'Every filing', 'Versioned, checksummed, downloadable'],
            ['Score basis', 'Approved only', 'Self-declaration does not count'],
          ].map(([l, v, s]) => (
            <div className="card kpi" key={l}>
              <div className="kl">{l}</div>
              <div className="kv">{v}</div>
              <div className="ks">{s}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="how" style={{ background: 'var(--canvas)', borderTop: '1px solid var(--line)', padding: '44px 26px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div className="cap mb8">How a compliance moves through the platform</div>
          <h2 style={{ fontSize: 22, marginBottom: 22 }}>From obligation to score, with an audit trail at every step</h2>
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
          <div className="cap mb8">Modules</div>
          <h2 style={{ fontSize: 22, marginBottom: 22 }}>Seven modules. Nothing that is not used.</h2>
          <div className="grid g-3">
            {MODULES.map(m => (
              <div className="card card-b" key={m.t}>
                <h3>{m.t}</h3>
                <p className="small muted mt4 mb0" style={{ lineHeight: 1.55 }}>{m.d}</p>
              </div>
            ))}
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
            does not operate there. Add further countries, states or entities at any time from
            Administration — no code change is required.
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
            The library ships as a working baseline drawn from published statutory
            frameworks. Each record carries a verification flag so the local adviser
            signs it off inside the platform, which stamps who verified it and when.
            It is not a substitute for local professional advice.
          </p>
        </div>
      </section>

      <footer style={{ borderTop: '1px solid var(--line)', padding: '18px 26px' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }} className="row between wrap g12">
          <span className="tiny muted">
            Global Compliance Management Platform · Version 1.0 · Internal use only
          </span>
          <Link href="/signin" className="tiny strong">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
