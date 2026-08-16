'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui';
import { LawTrivia } from '@/components/ui2';

type Me = { name: string; email: string; roleName: string };

export default function Profile() {
  const toast = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => {
      if (d.user) { setMe(d.user); setName(d.user.name); }
    }).finally(() => setLoading(false));
  }, []);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!me || !name.trim() || name.trim() === me.name) return;
    setSavingName(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast('Name updated.', 'ok');
      window.location.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update your name.', 'bad');
      setSavingName(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !next) return;
    if (next !== confirm) { toast('New password and confirmation do not match.', 'bad'); return; }
    if (next.length < 8) { toast('New password must be at least 8 characters.', 'bad'); return; }
    setSavingPw(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast('Password changed.', 'ok');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not change your password.', 'bad');
    } finally { setSavingPw(false); }
  }

  if (loading) return <LawTrivia big />;
  if (!me) return null;

  return (
    <>
      <div className="card mb16">
        <div className="card-h">
          <h3>Your details</h3>
          <span className="tiny muted">Visible only to you</span>
        </div>
        <form className="card-b" onSubmit={saveName}>
          <div className="f">
            <label htmlFor="pf-email">Email address</label>
            <input id="pf-email" value={me.email} disabled />
            <span className="tiny muted">
              Sign-in email can&apos;t be changed here — contact an administrator.
            </span>
          </div>
          <div className="f">
            <label htmlFor="pf-role">Role</label>
            <input id="pf-role" value={me.roleName} disabled />
          </div>
          <div className="f">
            <label htmlFor="pf-name">Display name</label>
            <input id="pf-name" value={name} onChange={e => setName(e.target.value)}
                   maxLength={120} />
          </div>
          <div className="row g8 mt8">
            <button type="submit" className="btn btn-p"
                    disabled={savingName || !name.trim() || name.trim() === me.name}>
              {savingName ? 'Saving…' : 'Save name'}
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Change password</h3>
          <span className="tiny muted">You&apos;ll need your current password</span>
        </div>
        <form className="card-b" onSubmit={savePassword}>
          <div className="f">
            <label htmlFor="pf-cur">Current password</label>
            <input id="pf-cur" type="password" value={current}
                   onChange={e => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="f">
            <label htmlFor="pf-new">New password</label>
            <input id="pf-new" type="password" value={next}
                   onChange={e => setNext(e.target.value)} autoComplete="new-password" />
            <span className="tiny muted">At least 8 characters.</span>
          </div>
          <div className="f">
            <label htmlFor="pf-confirm">Confirm new password</label>
            <input id="pf-confirm" type="password" value={confirm}
                   onChange={e => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="row g8 mt8">
            <button type="submit" className="btn btn-p"
                    disabled={savingPw || !current || !next || !confirm}>
              {savingPw ? 'Saving…' : 'Change password'}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
