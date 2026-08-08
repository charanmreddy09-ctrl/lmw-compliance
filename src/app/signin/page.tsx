'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ic } from '@/components/ui';

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
          <div className="auth2-eyebrow">Welcome to</div>
          <h1 className="auth2-h1">Compliance<br />Management Platform</h1>
          <p className="auth2-sub">One platform. Complete compliance visibility.</p>

          <div className="auth2-features">
            {[
              { icon: 'doc' as const, t: 'Centralised Compliance', d: 'All obligations. All entities. One trusted record.' },
              { icon: 'shield' as const, t: 'Verified & Reviewed', d: 'Every filing reviewed. Only approved counts.' },
              { icon: 'globe' as const, t: 'Global. Local. Real-time.', d: 'Live compliance status across every location.' },
            ].map(f => (
              <div className="auth2-feature" key={f.t}>
                <span className="fi"><Ic n={f.icon} s={16} /></span>
                <div>
                  <div className="ft">{f.t}</div>
                  <div className="fd">{f.d}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="auth2-footnote">
            <span>🔒</span> Secure. Reliable.
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
              <input id="email" type="email" autoComplete="username" required
                     value={email} onChange={e => setEmail(e.target.value)}
                     placeholder="name@lmw.example" disabled={busy} />
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
                  Password resets are handled by your administrator - contact your CFO's office or
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
            <span style={{ marginTop: 1 }}>🔒</span>
            <div>
              <strong>Authorised users only.</strong> Activity is recorded in the audit trail.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

