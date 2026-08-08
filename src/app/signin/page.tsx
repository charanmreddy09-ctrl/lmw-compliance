'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ic } from '@/components/ui';

/* The statistics bar carries the platform's actual scope, not round numbers
   chosen because they look impressive. LMW is two legal entities in two
   countries; the reference design showed "25+ countries / 500+ entities /
   10K+ compliances", which would be a fabrication on this deployment and the
   first thing a CFO would catch. The obligation count matches the seeded
   library, and "Approved only" is a statement about how the score is derived
   rather than a metric. Update these here if the group's scope changes. */
const SCOPE = [
  { icon: 'globe', value: '2', label: 'Countries' },
  { icon: 'building', value: '2', label: 'Legal entities' },
  { icon: 'doc', value: '95+', label: 'Statutory obligations' },
  { icon: 'shield', value: 'Approved only', label: 'Score basis' },
] as const;

const PROPOSITIONS = [
  { icon: 'doc' as const, title: 'Centralised compliance',
    body: 'Every obligation, every entity, one record of what was filed.' },
  { icon: 'shield' as const, title: 'Verified and reviewed',
    body: 'A reviewer accepts the evidence before anything counts.' },
  { icon: 'globe' as const, title: 'Group and local',
    body: 'Live position by country, entity and law.' },
];

export default function SignInPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [showForgot, setShowForgot] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Unable to sign in.');
      /* Read the return path at submit time rather than during render: that
         keeps this page statically renderable, so the form paints instantly
         instead of flashing a loader while Suspense resolves. */
      const next = new URLSearchParams(window.location.search).get('next');
      const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
      router.replace(safe ?? data.redirect ?? '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
      setBusy(false);
    }
  }

  return (
    <div className="auth2">
      <div className="auth2-side">
        <div className="auth2-side-bg" />
        <div className="auth2-side-content">
          <div className="auth2-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/lmw-logo-official.png" alt="LMW" />
            <span className="bar" />
            <span className="tag">Statutory compliance, evidenced.</span>
          </div>

          <div className="auth2-eyebrow">Welcome to</div>
          <h1 className="auth2-h1">
            LMW Global Compliance<br />Management Platform
          </h1>
          <p className="auth2-sub">One platform. Complete compliance visibility.</p>

          <div className="auth2-features">
            {PROPOSITIONS.map(f => (
              <div className="auth2-feature" key={f.title}>
                <span className="fi"><Ic n={f.icon} s={17} /></span>
                <div className="ft">{f.title}</div>
                <div className="fd">{f.body}</div>
              </div>
            ))}
          </div>

          <div className="auth2-stats">
            {SCOPE.map(s => (
              <div className="auth2-stat" key={s.label}>
                <span className="si"><Ic n={s.icon} s={18} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="sv">{s.value}</div>
                  <div className="sl">{s.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="auth2-footnote">
            <Ic n="shield" s={14} /> Evidence-backed. Auditable. Access-controlled.
          </div>
        </div>
      </div>

      <div className="auth2-panel">
        <div className="auth2-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lmw-logo-official.png" alt="LMW" className="auth2-logo" />

          <h2>Welcome back</h2>
          <p className="lead">Sign in to continue to your account.</p>

          <form onSubmit={submit} noValidate>
            <div className="f">
              <label htmlFor="email">Email address</label>
              <div className="auth2-field">
                <span className="ficon"><Ic n="send" s={15} /></span>
                <input id="email" type="email" autoComplete="username" required
                       value={email} onChange={e => setEmail(e.target.value)}
                       placeholder="name@lmw.example" disabled={busy} />
              </div>
            </div>

            <div className="f">
              <div className="row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label htmlFor="pw">Password</label>
                <button type="button" className="auth2-forgot" onClick={() => setShowForgot(v => !v)}>
                  Forgot password?
                </button>
              </div>
              <div className="auth2-pw">
                <input id="pw" type={showPw ? 'text' : 'password'} autoComplete="current-password" required
                       value={password} onChange={e => setPassword(e.target.value)}
                       placeholder="••••••••••" disabled={busy} />
                <button type="button" className="auth2-pw-toggle"
                        onClick={() => setShowPw(v => !v)}
                        aria-label={showPw ? 'Hide password' : 'Show password'}>
                  <Ic n="eye" s={16} />
                </button>
              </div>
              {showForgot && (
                <p className="tiny muted mt8 mb0">
                  Password resets are handled by your administrator - contact your CFO&apos;s office or
                  platform administrator to have it reset.
                </p>
              )}
            </div>

            {/* fixed slot so the form does not jump when an error appears */}
            <div style={{ minHeight: 44, marginBottom: 4 }}>
              {error && (
                <div className="note note-b">
                  <span style={{ marginTop: 1 }}><Ic n="alert" s={15} /></span>
                  <div>{error}</div>
                </div>
              )}
            </div>

            <button type="submit" className="btn btn-p btn-block" disabled={busy || !email || !password}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="auth2-security">
            <span style={{ marginTop: 1 }}><Ic n="shield" s={14} /></span>
            <div>
              <strong>Authorised users only.</strong> Every action is recorded in the audit trail.
            </div>
          </div>

          <div className="auth2-cardfoot">
            <div className="item">
              <Ic n="info" s={16} />
              <div>
                <div className="lbl">Need help?</div>
                <div className="val">Contact your administrator</div>
              </div>
            </div>
            <span className="sep" />
            <div className="item">
              <Ic n="shield" s={16} />
              <div>
                <div className="lbl">Security first</div>
                <div className="val">Access is scoped to your role</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="auth2-foot">
        <span>© {new Date().getFullYear()} LMW Limited. All rights reserved.</span>
        <span>Version 1.2 · Internal use only</span>
      </div>
    </div>
  );
}
