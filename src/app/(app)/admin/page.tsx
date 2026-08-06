'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Ic, Modal, Note, Spinner, DataTable, type Col,
  fmtDate, fmtDateTime, useToast, initials,
} from '@/components/ui';
import type { SessionUser } from '@/lib/rbac';

type User = {
  id: string; email: string; full_name: string; role_id: string; role_name: string;
  status: string; must_reset: boolean; last_login_at: string | null; created_at: string;
  entities: string | null; can_review: boolean | null; can_file: boolean | null;
  invited_by_email: string | null;
};
type Role = { id: string; name: string; description: string | null; permissions: string[] };
type Ent = { id: string; short_name: string; name: string; country_code: string };
type Deleg = {
  id: string; scope_type: string; scope_value: string | null;
  valid_from: string; valid_to: string | null; note: string | null; is_active: boolean;
  created_at: string; from_name: string; from_email: string;
  to_name: string; to_email: string; to_user_id: string; to_role: string;
};
type Audit = {
  id: number; actor_email: string; actor_role: string | null; action: string;
  object_type: string; object_id: string | null; detail: string | null; created_at: string;
};

const STATUS_TONE: Record<string, string> = { active: 'p-ok', pending: 'p-warn', disabled: 'p-mute' };

export default function Admin() {
  const toast = useToast();
  const [me, setMe] = useState<SessionUser | null>(null);
  const [tab, setTab] = useState('users');

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [ents, setEnts] = useState<Ent[]>([]);
  const [delegs, setDelegs] = useState<Deleg[]>([]);
  const [dRefs, setDRefs] = useState<{
    candidates: { id: string; full_name: string; email: string; role_name: string }[];
    entities: Ent[]; countries: { code: string; name: string }[];
  }>({ candidates: [], entities: [], countries: [] });
  const [audit, setAudit] = useState<Audit[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [invite, setInvite] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [newDeleg, setNewDeleg] = useState(false);
  const [created, setCreated] = useState<{ email: string; initialPassword: string; note: string } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const meRes = await fetch('/api/auth/me').then(r => r.json());
      setMe(meRes.user);
      const perms: string[] = meRes.user?.permissions ?? [];

      const tasks: Promise<void>[] = [];
      if (perms.includes('users.manage')) {
        tasks.push(fetch('/api/users').then(async r => {
          const d = await r.json();
          if (r.ok) { setUsers(d.users); setRoles(d.roles); setEnts(d.entities); }
        }));
      }
      tasks.push(fetch('/api/delegations').then(async r => {
        const d = await r.json();
        if (r.ok) {
          setDelegs(d.delegations);
          setDRefs({ candidates: d.candidates, entities: d.entities, countries: d.countries });
        }
      }));
      if (perms.includes('audit.view')) {
        tasks.push(fetch('/api/audit').then(async r => {
          const d = await r.json();
          if (r.ok) setAudit(d.entries);
        }));
      }
      await Promise.all(tasks);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Unable to load administration data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const canUsers = me?.permissions.includes('users.manage');
  const canDeleg = me?.permissions.includes('delegation.manage');
  const canAudit = me?.permissions.includes('audit.view');

  async function patchUser(id: string, body: Record<string, unknown>, msg: string) {
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      if (j.newPassword) {
        toast(`Password reset. New temporary password: ${j.newPassword}`, 'ok');
      } else toast(msg, 'ok');
      loadAll();
    } catch (e) { toast(e instanceof Error ? e.message : 'Action failed.', 'bad'); }
  }

  async function revoke(id: string) {
    if (!confirm('Revoke this delegation? The person loses the review authority immediately.')) return;
    try {
      const res = await fetch(`/api/delegations?id=${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast('Delegation revoked', 'ok');
      loadAll();
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not revoke.', 'bad'); }
  }

  const userCols: Col<User & Record<string, unknown>>[] = [
    { key: 'full_name', label: 'User', sort: true, cls: 'w',
      render: r => (
        <div className="row g8">
          <span className="av" style={{ width: 24, height: 24, fontSize: 9.5 }}>{initials(r.full_name)}</span>
          <div><div className="t1">{r.full_name}</div><div className="t2">{r.email}</div></div>
        </div>) },
    { key: 'role_name', label: 'Role', sort: true, cls: 'small nowrap' },
    { key: 'entities', label: 'Scope', sort: true, cls: 'small w',
      render: r => (<>
        <div>{r.entities ?? <span className="dim">No entities assigned</span>}</div>
        <div className="t2 row g4 mt4">
          {r.can_file && <span className="pill p-mute nd tiny">can file</span>}
          {r.can_review && <span className="pill p-info nd tiny">can review</span>}
        </div>
      </>) },
    { key: 'last_login_at', label: 'Last sign-in', sort: true, cls: 'small nowrap',
      render: r => r.last_login_at ? fmtDateTime(r.last_login_at) : <span className="dim">Never</span> },
    { key: 'status', label: 'Status', sort: true,
      render: r => <span className={`pill ${STATUS_TONE[r.status] ?? 'p-mute'}`}>{r.status}</span> },
    { key: 'actions', label: '', cls: 'nowrap no-print',
      render: r => (
        <div className="row g4">
          {r.status === 'pending' && (
            <button className="btn btn-xs btn-ok" title="Approve this account"
                    onClick={e => { e.stopPropagation(); patchUser(r.id, { status: 'active' }, `${r.email} approved`); }}>
              <Ic n="check2" s={12} /> Approve
            </button>
          )}
          {r.status === 'active' && r.id !== me?.id && (
            <button className="btn btn-xs" title="Disable"
                    onClick={e => { e.stopPropagation(); patchUser(r.id, { status: 'disabled' }, `${r.email} disabled`); }}>
              Disable
            </button>
          )}
          {r.status === 'disabled' && (
            <button className="btn btn-xs" title="Re-enable"
                    onClick={e => { e.stopPropagation(); patchUser(r.id, { status: 'active' }, `${r.email} re-enabled`); }}>
              Enable
            </button>
          )}
          <button className="btn btn-xs" title="Reset password"
                  onClick={e => { e.stopPropagation(); patchUser(r.id, { resetPassword: true }, 'Password reset'); }}>
            <Ic n="shield" s={12} />
          </button>
          <button className="btn btn-xs" title="Edit scope"
                  onClick={e => { e.stopPropagation(); setEditUser(r); }}>
            <Ic n="edit" s={12} />
          </button>
        </div>) },
  ];

  if (err) return <Note kind="b">{err}</Note>;
  if (loading) return <Spinner label="Loading administration…" />;

  const TABS = [
    ...(canUsers ? [{ id: 'users', label: `Users (${users.length})` }] : []),
    { id: 'delegation', label: `Delegation (${delegs.filter(d => d.is_active).length} active)` },
    ...(canUsers ? [{ id: 'roles', label: 'Roles and permissions' }] : []),
    ...(canAudit ? [{ id: 'audit', label: 'Audit trail' }] : []),
  ];
  const activeTab = TABS.some(t => t.id === tab) ? tab : TABS[0]?.id ?? 'delegation';

  return (
    <>
      <div className="tabs no-print">
        {TABS.map(t => (
          <button key={t.id} className={`tab${activeTab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------------- USERS */}
      {activeTab === 'users' && canUsers && (
        <>
          <div className="mb16">
            <Note kind="i">
              Logins are created from a company email address. A new account is <strong>pending</strong>
              {' '}until the CFO or an administrator approves it, and cannot sign in before then.
            </Note>
          </div>

          <div className="grid g-4 mb16">
            {[
              ['Active accounts', users.filter(u => u.status === 'active').length],
              ['Awaiting approval', users.filter(u => u.status === 'pending').length],
              ['Disabled', users.filter(u => u.status === 'disabled').length],
              ['With review authority', users.filter(u => u.can_review).length],
            ].map(([l, v]) => (
              <div className="card kpi" key={String(l)}>
                <div className="kl">{l}</div><div className="kv">{v as number}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Users</h3>
              <button className="btn btn-p btn-s no-print" onClick={() => setInvite(true)}>
                <Ic n="plus" s={13} /> Create login
              </button>
            </div>
            <DataTable<User & Record<string, unknown>>
              rows={users as (User & Record<string, unknown>)[]}
              cols={userCols} rowKey={r => r.id} pageSize={40} />
          </div>
        </>
      )}

      {/* ----------------------------------------------------------- DELEGATION */}
      {activeTab === 'delegation' && (
        <>
          <div className="mb16">
            <Note kind="i">
              The CFO does not review individual filings. Review authority is delegated here — by
              country, by entity or across the whole group — and the platform honours it immediately
              without changing anyone&apos;s role. Every delegated decision stays attributed to the
              person who made it.
            </Note>
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Review delegations</h3>
              {canDeleg && (
                <button className="btn btn-p btn-s no-print" onClick={() => setNewDeleg(true)}>
                  <Ic n="plus" s={13} /> Delegate review authority
                </button>
              )}
            </div>
            <div className="tw">
              <table className="dt">
                <thead><tr>
                  <th>Delegated to</th><th>Scope</th><th>Valid from</th><th>Valid to</th>
                  <th>Delegated by</th><th>Status</th><th className="no-print" />
                </tr></thead>
                <tbody>
                  {delegs.length === 0 && (
                    <tr><td colSpan={7}><div className="empty">
                      No delegations. Reviews are handled by the assigned reviewers and country heads.
                    </div></td></tr>
                  )}
                  {delegs.map(d => (
                    <tr key={d.id} style={{ opacity: d.is_active ? 1 : .55 }}>
                      <td><div className="t1">{d.to_name}</div>
                        <div className="t2">{d.to_email} · {d.to_role}</div></td>
                      <td className="small">
                        {d.scope_type === 'all'
                          ? <span className="pill p-info nd">All entities</span>
                          : <>{d.scope_type}: <span className="mono">{d.scope_value}</span></>}
                      </td>
                      <td className="small num nowrap">{fmtDate(d.valid_from)}</td>
                      <td className="small num nowrap">
                        {d.valid_to ? fmtDate(d.valid_to) : <span className="dim">Open ended</span>}
                      </td>
                      <td className="small">{d.from_name}</td>
                      <td>
                        <span className={`pill ${d.is_active ? 'p-ok' : 'p-mute'}`}>
                          {d.is_active ? 'Active' : 'Revoked'}
                        </span>
                      </td>
                      <td className="no-print">
                        {d.is_active && canDeleg && (
                          <button className="btn btn-xs" onClick={() => revoke(d.id)}>Revoke</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {delegs.some(d => d.note) && (
              <div className="card-f">
                {delegs.filter(d => d.note).map(d => (
                  <div className="tiny muted" key={d.id}>{d.to_name}: {d.note}</div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ---------------------------------------------------------------- ROLES */}
      {activeTab === 'roles' && canUsers && (
        <div className="grid g-2">
          {roles.map(r => (
            <div className="card" key={r.id}>
              <div className="card-h">
                <div>
                  <h3>{r.name}</h3>
                  <div className="tiny muted mt4 mono">{r.id}</div>
                </div>
                <span className="pill p-mute nd">{users.filter(u => u.role_id === r.id).length} users</span>
              </div>
              <div className="card-b">
                <p className="small muted">{r.description}</p>
                <div className="cap mb8 mt12">Permissions</div>
                <div className="row g4 wrap">
                  {(r.permissions ?? []).map(p => (
                    <span className="pill p-mute nd tiny mono" key={p}>{p}</span>
                  ))}
                </div>
                {r.id === 'CFO' && (
                  <div className="mt12"><Note kind="i">
                    Deliberately excludes <span className="mono">compliance.review</span> — the CFO
                    monitors and delegates rather than approving individual filings.
                  </Note></div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------------------------------------------------------------- AUDIT */}
      {activeTab === 'audit' && canAudit && (
        <div className="card">
          <div className="card-h">
            <h3>Audit trail</h3>
            <span className="tiny muted">Most recent 400 entries · every action is recorded</span>
          </div>
          <div className="tw">
            <table className="dt">
              <thead><tr>
                <th>When</th><th>Who</th><th>Action</th><th>Object</th><th>Detail</th>
              </tr></thead>
              <tbody>
                {audit.length === 0 && (
                  <tr><td colSpan={5}><div className="empty">No audit entries yet.</div></td></tr>
                )}
                {audit.map(a => (
                  <tr key={a.id}>
                    <td className="small nowrap num">{fmtDateTime(a.created_at)}</td>
                    <td className="small nowrap">{a.actor_email}
                      {a.actor_role && <div className="t2">{a.actor_role}</div>}</td>
                    <td><span className="pill p-mute nd tiny mono">{a.action}</span></td>
                    <td className="small nowrap">{a.object_type}</td>
                    <td className="small w">{a.detail ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {invite && (
        <InviteModal roles={roles} entities={ents}
                     onClose={() => setInvite(false)}
                     onCreated={c => { setInvite(false); setCreated(c); loadAll(); }} />
      )}

      {created && (
        <Modal title="Login created" sub={created.email} onClose={() => setCreated(null)}
               footer={<button className="btn btn-p" onClick={() => setCreated(null)}>Done</button>}>
          <Note kind="o">{created.note}</Note>
          <div className="f mt16">
            <label>Initial password</label>
            <input readOnly value={created.initialPassword} className="mono"
                   onClick={e => (e.target as HTMLInputElement).select()} />
            <div className="h">
              Share this over a secure channel. The user is prompted to change it, and the
              platform records that the account was created by you.
            </div>
          </div>
        </Modal>
      )}

      {editUser && (
        <ScopeModal user={editUser} entities={ents} roles={roles}
                    onClose={() => setEditUser(null)}
                    onSaved={() => { setEditUser(null); loadAll(); }} />
      )}

      {newDeleg && (
        <DelegModal refs={dRefs} onClose={() => setNewDeleg(false)}
                    onSaved={() => { setNewDeleg(false); loadAll(); }} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ invite */
function InviteModal({ roles, entities, onClose, onCreated }: {
  roles: Role[]; entities: Ent[];
  onClose: () => void;
  onCreated: (c: { email: string; initialPassword: string; note: string }) => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('PREPARER');
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [canFile, setCanFile] = useState(true);
  const [canReview, setCanReview] = useState(false);
  const [approve, setApprove] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    /* sensible defaults per role, still fully editable */
    if (role === 'PREPARER') { setCanFile(true); setCanReview(false); setAll(false); }
    if (role === 'REVIEWER') { setCanFile(false); setCanReview(true); }
    if (role === 'COUNTRY_HEAD') { setCanFile(false); setCanReview(true); }
    if (role === 'CFO' || role === 'CFO_OFFICE' || role === 'ADMIN' || role === 'AUDITOR') {
      setAll(true); setCanFile(false); setCanReview(role === 'CFO_OFFICE');
    }
  }, [role]);

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email, full_name: name, role_id: role,
          entities: all ? ['*'] : picked,
          can_file: canFile, can_review: canReview, approve,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      onCreated({ email: j.email, initialPassword: j.initialPassword, note: j.note });
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create the login.', 'bad');
      setBusy(false);
    }
  }

  return (
    <Modal size="w" title="Create a login" sub="By email address" onClose={onClose}
           footer={<>
             <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
             <button className="btn btn-p" onClick={save}
                     disabled={busy || !email || !name || (!all && picked.length === 0)}>
               {busy ? 'Creating…' : 'Create login'}
             </button>
           </>}>
      <div className="f2">
        <div className="f">
          <label>Email address *</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                 placeholder="name@yourcompany.com" />
          <div className="h">This becomes the sign-in identity. It must be unique.</div>
        </div>
        <div className="f">
          <label>Full name *</label>
          <input value={name} onChange={e => setName(e.target.value)} />
        </div>
      </div>

      <div className="f">
        <label>Role *</label>
        <select value={role} onChange={e => setRole(e.target.value)}>
          {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <div className="h">{roles.find(r => r.id === role)?.description}</div>
      </div>

      <div className="f">
        <label>Entity access *</label>
        <label className="small row g6 mb8" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} style={{ width: 'auto' }} />
          All entities (group-wide access)
        </label>
        {!all && (
          <div style={{
            maxHeight: 190, overflowY: 'auto', border: '1px solid var(--line)',
            borderRadius: 'var(--r)', padding: 8,
          }}>
            {entities.map(en => (
              <label key={en.id} className="small row g6" style={{ cursor: 'pointer', padding: '2px 0' }}>
                <input type="checkbox" checked={picked.includes(en.id)} style={{ width: 'auto' }}
                       onChange={e => setPicked(p => e.target.checked ? [...p, en.id] : p.filter(x => x !== en.id))} />
                {en.short_name} <span className="dim">· {en.country_code} · {en.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="f">
        <label>Rights on those entities</label>
        <div className="row g16 wrap mt4">
          <label className="small row g6" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={canFile} onChange={e => setCanFile(e.target.checked)} style={{ width: 'auto' }} />
            Can file compliances and upload evidence
          </label>
          <label className="small row g6" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={canReview} onChange={e => setCanReview(e.target.checked)} style={{ width: 'auto' }} />
            Can review submissions
          </label>
        </div>
      </div>

      <div className="f">
        <label className="small row g6" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={approve} onChange={e => setApprove(e.target.checked)} style={{ width: 'auto' }} />
          Approve this account immediately
        </label>
        <div className="h">
          Leave unticked to create it as pending, which is the safer default — someone then has to
          approve it before the person can sign in.
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------- scope */
function ScopeModal({ user, entities, roles, onClose, onSaved }: {
  user: User; entities: Ent[]; roles: Role[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const wasAll = (user.entities ?? '').includes('All entities');
  const [role, setRole] = useState(user.role_id);
  const [name, setName] = useState(user.full_name);
  const [all, setAll] = useState(wasAll);
  const [picked, setPicked] = useState<string[]>(
    wasAll ? [] : (user.entities ?? '').split(',').map(s => s.trim()).filter(Boolean));
  const [canFile, setCanFile] = useState(!!user.can_file);
  const [canReview, setCanReview] = useState(!!user.can_review);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: user.id, role_id: role, full_name: name,
          entities: all ? ['*'] : picked, can_file: canFile, can_review: canReview,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast('User updated', 'ok');
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not update the user.', 'bad');
      setBusy(false);
    }
  }

  return (
    <Modal size="w" title={user.full_name} sub={user.email} onClose={onClose}
           footer={<>
             <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
             <button className="btn btn-p" onClick={save} disabled={busy || (!all && !picked.length)}>
               {busy ? 'Saving…' : 'Save'}
             </button>
           </>}>
      <div className="f2">
        <div className="f"><label>Full name</label>
          <input value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="f"><label>Role</label>
          <select value={role} onChange={e => setRole(e.target.value)}>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select></div>
      </div>

      <div className="f">
        <label>Entity access</label>
        <label className="small row g6 mb8" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} style={{ width: 'auto' }} />
          All entities
        </label>
        {!all && (
          <div style={{ maxHeight: 190, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 8 }}>
            {entities.map(en => (
              <label key={en.id} className="small row g6" style={{ cursor: 'pointer', padding: '2px 0' }}>
                <input type="checkbox" checked={picked.includes(en.id)} style={{ width: 'auto' }}
                       onChange={e => setPicked(p => e.target.checked ? [...p, en.id] : p.filter(x => x !== en.id))} />
                {en.short_name} <span className="dim">· {en.country_code}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="f">
        <label>Rights</label>
        <div className="row g16 wrap mt4">
          <label className="small row g6" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={canFile} onChange={e => setCanFile(e.target.checked)} style={{ width: 'auto' }} />
            Can file and upload evidence
          </label>
          <label className="small row g6" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={canReview} onChange={e => setCanReview(e.target.checked)} style={{ width: 'auto' }} />
            Can review submissions
          </label>
        </div>
      </div>
      <Note kind="i">Changing entity access rewrites this user&apos;s scope. It takes effect the next
        time they load a page.</Note>
    </Modal>
  );
}

/* -------------------------------------------------------------- delegation */
function DelegModal({ refs, onClose, onSaved }: {
  refs: {
    candidates: { id: string; full_name: string; email: string; role_name: string }[];
    entities: Ent[]; countries: { code: string; name: string }[];
  };
  onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [to, setTo] = useState('');
  const [scope, setScope] = useState<'all' | 'country' | 'entity'>('country');
  const [value, setValue] = useState('');
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch('/api/delegations', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          to_user_id: to, scope_type: scope,
          scope_value: scope === 'all' ? null : value,
          valid_from: from, valid_to: until || null, note,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      toast('Review authority delegated. The person has been notified.', 'ok');
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create the delegation.', 'bad');
      setBusy(false);
    }
  }

  return (
    <Modal title="Delegate review authority" sub="Takes effect immediately" onClose={onClose}
           footer={<>
             <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
             <button className="btn btn-p" onClick={save}
                     disabled={busy || !to || (scope !== 'all' && !value)}>
               {busy ? 'Saving…' : 'Delegate'}
             </button>
           </>}>
      <div className="f">
        <label>Delegate to *</label>
        <select value={to} onChange={e => setTo(e.target.value)}>
          <option value="">Select a person…</option>
          {refs.candidates.map(c => (
            <option key={c.id} value={c.id}>{c.full_name} — {c.role_name}</option>
          ))}
        </select>
        <div className="h">Only active reviewers, country heads, the CFO&apos;s office and administrators are eligible.</div>
      </div>

      <div className="f">
        <label>Scope *</label>
        <div className="row g6 wrap">
          {([['country', 'By country'], ['entity', 'By entity'], ['all', 'All entities']] as const).map(([k, l]) => (
            <button key={k} className={`btn btn-s${scope === k ? ' btn-p' : ''}`}
                    onClick={() => { setScope(k); setValue(''); }}>{l}</button>
          ))}
        </div>
      </div>

      {scope === 'country' && (
        <div className="f">
          <label>Country *</label>
          <select value={value} onChange={e => setValue(e.target.value)}>
            <option value="">Select…</option>
            {refs.countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
      )}
      {scope === 'entity' && (
        <div className="f">
          <label>Entity *</label>
          <select value={value} onChange={e => setValue(e.target.value)}>
            <option value="">Select…</option>
            {refs.entities.map(en => (
              <option key={en.id} value={en.id}>{en.short_name} ({en.country_code})</option>
            ))}
          </select>
        </div>
      )}

      <div className="f2">
        <div className="f"><label>Valid from</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="f"><label>Valid to</label>
          <input type="date" value={until} onChange={e => setUntil(e.target.value)} />
          <div className="h">Leave blank for an open-ended delegation.</div></div>
      </div>

      <div className="f">
        <label>Reason / note</label>
        <textarea value={note} onChange={e => setNote(e.target.value)}
                  placeholder="For example: covering the India review queue during the audit period." />
      </div>
    </Modal>
  );
}
