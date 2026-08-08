'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Ic } from '@/components/ui';

export default function SignInPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="auth">
      <div className="auth-art">
        <div>
          <Link href="/" className="row g8" style={{ textDecoration: 'none' }}>
            <Ic n="back" s={15} c="#93A8CC" />
            <span className="tiny" style={{ color: '#93A8CC' }}>Back to overview</span>
          </Link>
        </div>

        <div>
          <div className="cap mb12" style={{ color: '#7D93B8' }}>LMW Limited</div>
          <h1 style={{ color: '#fff', fontSize: 27, lineHeight: 1.3, letterSpacing: '-0.02em', maxWidth: 460 }}>
            LMW Compliance Management Platform
          </h1>
          <p className="mt16" style={{ color: '#A9BCD9', fontSize: 13.5, lineHeight: 1.65, maxWidth: 430 }}>
            A single record of what each entity is required to file, what it actually
            filed, the document that proves it, and who reviewed it.
          </p>

          <div className="mt24" style={{ display: 'grid', gap: 10, maxWidth: 430 }}>
            {[
              ['Evidence, not assurances', 'Every obligation carries the filed document.'],
              ['Reviewed before it counts', 'Only approved filings lift the compliance score.'],
              ['Live across every country you operate in', 'Federal and state/province level, updated from Excel in minutes.'],
            ].map(([t, d]) => (
              <div className="row-t g8" key={t}>
                <span style={{ marginTop: 2, color: '#7FA3D9' }}><Ic n="check2" s={14} /></span>
                <div>
                  <div style={{ color: '#fff', fontSize: 12.5, fontWeight: 600 }}>{t}</div>
                  <div style={{ color: '#8FA5C6', fontSize: 11.5 }}>{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="tiny" style={{ color: '#6B80A6' }}>
          Authorised users only. All activity is recorded in the audit trail.
        </div>
      </div>

      <div className="auth-panel">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="https://www.lmwglobal.com/images/lmw-logo.png" alt="LMW"
             style={{ height: 34, width: 'auto', marginBottom: 26 }} />

        <h2 style={{ fontSize: 19 }}>Sign in</h2>
        <p className="small muted mb16">Use the email address registered for you on the platform.</p>

        <form onSubmit={submit} noValidate>
          <div className="f">
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="username" required
                   value={email} onChange={e => setEmail(e.target.value)}
                   placeholder="name@lmw.example" disabled={busy} />
          </div>

          <div className="f">
            <label htmlFor="pw">Password</label>
            <input id="pw" type="password" autoComplete="current-password" required
                   value={password} onChange={e => setPassword(e.target.value)}
                   placeholder="••••••••••" disabled={busy} />
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

        <div className="mt24" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 14 }}>
          <p className="tiny muted mb0">
            Accounts are created by the CFO’s office or a platform administrator using your
            company email address. A new account cannot sign in until it has been approved.
            If you cannot get in, contact your administrator rather than retrying - repeated
            failures are logged.
          </p>
        </div>
      </div>
    </div>
  );
}

