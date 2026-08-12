'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ic } from '@/components/ui';
import '../signin.css';

/* This screen is shared by every company on the platform, signed in or not -
   it cannot claim one customer's country/entity count as if it were the
   platform's own. These read as capabilities rather than a live figure, so
   the page stays accurate for a one-entity company and a fifty-entity group
   alike. "Approved only" is a statement about how the score is derived, not
   a metric dressed up as one. */
const SCOPE = [
  { icon: 'building', value: 'Global', label: 'Coverage', sub: 'Every country you operate in' },
  { icon: 'users', value: 'Unlimited', label: 'Legal entities', sub: 'One record for the whole group' },
  { icon: 'doc', value: '95+', label: 'Statutory obligations', sub: 'Tracked and managed' },
  { icon: 'shield', value: 'Approved only', label: '', sub: 'Activity through defined workflow' },
] as const;

const PROPOSITIONS = [
  { icon: 'list' as const, title: 'Centralised compliance',
    body: 'All obligations across entities in one trusted record.' },
  { icon: 'shield' as const, title: 'Verified and reviewed',
    body: 'Every filing is reviewed and approved by authorised personnel.' },
  { icon: 'globe' as const, title: 'Global. Local. Real-time.',
    body: 'Live compliance status across every geography and entity.' },
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
    <div className="lg">
      <div className="lg-bg" />

      <div className="lg-inner">
        <div>
          <div className="lg-brand">
            <span className="lg-mark"><Ic n="shield" s={20} c="#fff" /></span>
            <span className="bar" />
            <span className="tag">Evidence-backed. Audit-ready.</span>
          </div>

          <div className="lg-eyebrow">Welcome to</div>
          <h1 className="lg-h1">MCA Compliance 360</h1>
          <div className="lg-rule" />
          <p className="lg-sub">One platform. Complete compliance visibility.</p>

          <div className="lg-cards">
            {PROPOSITIONS.map(p => (
              <div className="lg-card" key={p.title}>
                <span className="ic"><Ic n={p.icon} s={19} /></span>
                <div className="t">{p.title}</div>
                <div className="d">{p.body}</div>
              </div>
            ))}
          </div>

          <div className="lg-stats">
            {SCOPE.map(s => (
              <div className="lg-stat" key={s.sub}>
                <span className="si"><Ic n={s.icon} s={19} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="sv">{s.value}</div>
                  {s.label && <div className="sl">{s.label}</div>}
                  <div className="ss">{s.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="lg-trust">
            <Ic n="shield" s={16} /> Secure. Reliable. Compliant.
          </div>
        </div>

        <div className="lg-panel">
          <div className="lg-form">
            <span className="lg-mark lg-mark-form"><Ic n="shield" s={20} c="#fff" /></span>

            <h2>Welcome back</h2>
            <p className="lead">Sign in to continue to your account.</p>

            <form onSubmit={submit} noValidate>
              <label className="lg-label" htmlFor="email">Email address</label>
              <div className="lg-input">
                <span className="ic"><Ic n="send" s={16} /></span>
                <input id="email" type="email" autoComplete="username" required
                       value={email} onChange={e => setEmail(e.target.value)}
                       placeholder="Enter your email" disabled={busy} />
              </div>

              <div className="lg-labelrow">
                <label className="lg-label" htmlFor="pw">Password</label>
                <button type="button" className="lg-forgot" onClick={() => setShowForgot(v => !v)}>
                  Forgot password?
                </button>
              </div>
              <div className="lg-input has-toggle">
                <span className="ic"><Ic n="lock" s={16} /></span>
                <input id="pw" type={showPw ? 'text' : 'password'} autoComplete="current-password" required
                       value={password} onChange={e => setPassword(e.target.value)}
                       placeholder="Enter your password" disabled={busy} />
                <button type="button" className="lg-eye" onClick={() => setShowPw(v => !v)}
                        aria-label={showPw ? 'Hide password' : 'Show password'}>
                  <Ic n="eye" s={17} />
                </button>
              </div>

              {showForgot && (
                <p className="tiny muted" style={{ marginTop: -8, marginBottom: 14 }}>
                  Password resets are handled by your administrator - contact your CFO&apos;s office or
                  platform administrator to have it reset.
                </p>
              )}

              <div className="lg-err">
                {error && (
                  <div>
                    <span style={{ marginTop: 1 }}><Ic n="alert" s={15} /></span>
                    <div>{error}</div>
                  </div>
                )}
              </div>

              <button type="submit" className="lg-submit" disabled={busy || !email || !password}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <div className="lg-notice">
              <Ic n="lock" s={17} />
              <div>
                <div className="t">Authorised users only.</div>
                <div className="d">All activities are logged and monitored.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="lg-foot">
        <span>© {new Date().getFullYear()} MCA Compliance 360. All rights reserved.</span>
        <span className="lg-foot-links">
          <span className="row g6"><Ic n="globe" s={15} /> English</span>
          <span className="sep" />
          <span>Privacy Policy</span>
          <span className="sep" />
          <span>Terms of Use</span>
          <span className="sep" />
          <span>Support</span>
        </span>
      </div>
    </div>
  );
}
