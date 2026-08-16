'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui';

/* Reached automatically (see AppShell's mustReset redirect) whenever the
   signed-in account was just created or had its password reset by an
   administrator - must_reset stays set until this succeeds, and every other
   route is blocked in the meantime (see lib/api.ts's auth()). Voluntarily
   changing a password you already know still happens on the Profile page;
   this page exists only to clear a reset that was forced on the account. */
export default function ResetPassword() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !next) return;
    if (next !== confirm) { toast('New password and confirmation do not match.', 'bad'); return; }
    if (next.length < 8) { toast('New password must be at least 8 characters.', 'bad'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast('Password set. Signing you in…', 'ok');
      window.location.href = '/dashboard';
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not set your new password.', 'bad');
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 480, margin: '40px auto' }}>
      <div className="card-h">
        <h3>Set a new password</h3>
        <span className="tiny muted">Required before you can continue</span>
      </div>
      <div className="card-b">
        <p className="small muted mb16">
          Your password was just issued or reset. Choose a new one only you know
          before going any further.
        </p>
        <form onSubmit={submit}>
          <div className="f">
            <label htmlFor="rp-cur">Current (temporary) password</label>
            <input id="rp-cur" type="password" value={current}
                   onChange={e => setCurrent(e.target.value)} autoComplete="current-password" autoFocus />
          </div>
          <div className="f">
            <label htmlFor="rp-new">New password</label>
            <input id="rp-new" type="password" value={next}
                   onChange={e => setNext(e.target.value)} autoComplete="new-password" />
            <span className="tiny muted">At least 8 characters.</span>
          </div>
          <div className="f">
            <label htmlFor="rp-confirm">Confirm new password</label>
            <input id="rp-confirm" type="password" value={confirm}
                   onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="row g8 mt8">
            <button type="submit" className="btn btn-p" disabled={saving || !current || !next || !confirm}>
              {saving ? 'Saving…' : 'Set password and continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
