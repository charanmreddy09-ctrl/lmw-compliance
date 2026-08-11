'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Ic, Modal, Note, Spinner, DataTable, type Col,
  fmtDate, fmtDateTime, useToast, initials,
} from '@/components/ui';
import { VividKpiCard, BadgeV2, SkeletonCard } from '@/components/ui2';
import type { SessionUser } from '@/lib/rbac';

type User = {
  id: string; email: string; full_name: string; role_id: string; role_name: string;
  status: string; must_reset: boolean; last_login_at: string | null; created_at: string;
  entities: string | null; can_review: boolean | null; can_file: boolean | null;
  category_ids: string[] | null;
  invited_by_email: string | null;
};
type Role = { id: string; name: string; description: string | null; permissions: string[] };
type Ent = { id: string; short_name: string; name: string; country_code: string };
type Cat = { id: string; name: string };
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

/* -------------------------------------------------------------- C19 / C20 */
type JobHealth = {
  job: string; label: string; lastRun: string | null; runs7d: number;
  lastDetail: string | null; state: 'never' | 'silent' | 'healthy'; hoursSince: number | null;
};
type Anomaly = { key: string; count: number; sample: string[] };
type Ops = {
  automation: JobHealth[];
  slaHours: number;
  silentAfterHours: number;
  notifications: { sent7d: number; unread: number; popupsOpen: number };
  anomalies: Anomaly[];
  checkedAt: string;
};

/* What each check means and how much it matters. "severe" reads as a defect
   rather than a backlog: these are the two that make the platform report
   something untrue, rather than merely leave work undone. */
const ANOMALY_META: Record<string, { label: string; why: string; tone: string; severe?: boolean }> = {
  approved_no_evidence: {
    label: 'Approved with no evidence on file', tone: 'p-bad', severe: true,
    why: 'The score treats an approval as proof. These inflate it.',
  },
  assignee_inactive: {
    label: 'Assigned to a disabled account', tone: 'p-bad', severe: true,
    why: 'Looks assigned, but the account cannot sign in. Nobody is working it.',
  },
  unassigned_review: {
    label: 'Submitted with no named reviewer', tone: 'p-warn',
    why: 'Visible to everyone with rights on the entity, owned by no one.',
  },
  review_overdue: {
    label: 'Past the review turnaround target', tone: 'p-warn',
    why: 'Evidence has been waiting on a decision longer than the target.',
  },
  unassigned_preparer: {
    label: 'Due and unfiled with no preparer', tone: 'p-warn',
    why: 'No one to remind, so no reminder is sent.',
  },
  compliance_no_due_rule: {
    label: 'Library records with no due rule', tone: 'p-warn',
    why: 'Without a due day and month a due date cannot be generated.',
  },
  compliance_unverified: {
    label: 'Library records not yet verified', tone: 'p-mute',
    why: 'Counted in the score, but no adviser has confirmed them.',
  },
  users_pending: {
    label: 'Accounts awaiting approval', tone: 'p-mute',
    why: 'Someone requested access and nobody has answered.',
  },
};

export default function Admin() {
  const toast = useToast();
  const [me, setMe] = useState<SessionUser | null>(null);
  const [tab, setTab] = useState('users');

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [ents, setEnts] = useState<Ent[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [delegs, setDelegs] = useState<Deleg[]>([]);
  const [dRefs, setDRefs] = useState<{
    candidates: { id: string; full_name: string; email: string; role_name: string }[];
    entities: Ent[]; countries: { code: string; name: string }[];
  }>({ candidates: [], entities: [], countries: [] });
  const [audit, setAudit] = useState<Audit[]>([]);
  const [ops, setOps] = useState<Ops | null>(null);

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
          if (r.ok) { setUsers(d.users); setRoles(d.roles); setEnts(d.entities); setCats(d.categories); }
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
        tasks.push(fetch('/api/operations').then(async r => {
          const d = await r.json();
          if (r.ok) setOps(d);
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
          {!!r.category_ids?.length && (
            <span className="pill p-warn nd tiny" title={r.category_ids.join(', ')}>
              {r.category_ids.length} categor{r.category_ids.length === 1 ? 'y' : 'ies'} only
            </span>
          )}
        </div>
      </>) },
    { key: 'last_login_at', label: 'Last sign-in', sort: true, cls: 'small nowrap',
      render: r => r.last_login_at ? fmtDateTime(r.last_login_at) : <span className="dim">Never</span> },
    { key: 'status', label: 'Status', sort: true,
      render: r => <BadgeV2 tone={r.status === 'active' ? 'ok' : r.status === 'pending' ? 'warn' : 'mute'}>{r.status}</BadgeV2> },
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

  /* Things that are actually wrong, not merely outstanding - the tab badge
     counts defects and silent jobs, so a long list of pending users does not
     make the platform look broken. */
  const opsIssues = ops
    ? ops.anomalies.filter(a => ANOMALY_META[a.key]?.severe && a.count > 0).length
      + ops.automation.filter(j => j.state !== 'healthy').length
    : 0;

  if (err) return <Note kind="b">{err}</Note>;
  if (loading) return (
    <div className="grid g-3">
      {Array.from({ length: 6 }, (_, i) => <SkeletonCard key={i} height={140} />)}
    </div>
  );

  const TABS = [
    ...(canUsers ? [{ id: 'users', label: `Users (${users.length})` }] : []),
    { id: 'delegation', label: `Delegation (${delegs.filter(d => d.is_active).length} active)` },
    ...(canUsers ? [{ id: 'roles', label: 'Roles and permissions' }] : []),
    ...(canAudit ? [{
      id: 'operations',
      label: opsIssues > 0 ? `Operations (${opsIssues})` : 'Operations',
    }] : []),
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

          <div className="grid g-4 mb16 stagger-in stagger-1">
            <VividKpiCard label="Active accounts" value={users.filter(u => u.status === 'active').length} icon="check2" gradient="var(--grad-emerald)" />
            <VividKpiCard label="Awaiting approval" value={users.filter(u => u.status === 'pending').length} icon="clock" gradient="var(--grad-amber)" />
            <VividKpiCard label="Disabled" value={users.filter(u => u.status === 'disabled').length} icon="lock" gradient="var(--grad-coral)" />
            <VividKpiCard label="With review authority" value={users.filter(u => u.can_review).length} icon="shield" gradient="var(--grad-violet)" />
          </div>

          <div className="card stagger-in stagger-2">
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
              The CFO does not review individual filings. Review authority is delegated here - by
              country, by entity or across the whole group - and the platform honours it immediately
              without changing anyone&apos;s role. Every delegated decision stays attributed to the
              person who made it.
            </Note>
          </div>

          <div className="card stagger-in stagger-1">
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
                        <BadgeV2 tone={d.is_active ? 'ok' : 'mute'}>{d.is_active ? 'Active' : 'Revoked'}</BadgeV2>
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
                    Deliberately excludes <span className="mono">compliance.review</span> - the CFO
                    monitors and delegates rather than approving individual filings.
                  </Note></div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ----------------------------------------------------- C19 / C20 OPS */}
      {activeTab === 'operations' && canAudit && (
        <>
          {!ops && <Spinner label="Running platform checks…" />}
          {ops && (
            <>
              <div className="card mb16">
                <div className="card-h">
                  <div>
                    <h3>Scheduled jobs</h3>
                    <span className="tiny muted">
                      Both run daily and are signed with <span className="mono">CRON_SECRET</span>.
                      Without that variable set in Vercel every run is rejected silently.
                    </span>
                  </div>
                </div>
                <div className="tw">
                  <table className="dt">
                    <thead><tr>
                      <th>Job</th><th>Status</th><th>Last run</th>
                      <th className="right">Runs (7d)</th><th className="w">Last result</th>
                    </tr></thead>
                    <tbody>
                      {ops.automation.map(j => (
                        <tr key={j.job}>
                          <td><div className="t1">{j.label}</div>
                            <div className="t2 mono">{j.job}</div></td>
                          <td>
                            <BadgeV2 tone={j.state === 'healthy' ? 'ok' : 'bad'} pulse={j.state !== 'healthy'}>
                              {j.state === 'healthy' ? 'Healthy' : j.state === 'silent' ? 'Silent' : 'Never run'}
                            </BadgeV2>
                          </td>
                          <td className="small nowrap">
                            {j.lastRun ? (<>{fmtDateTime(j.lastRun)}
                              <div className="t2">{j.hoursSince}h ago</div></>) : <span className="dim">-</span>}
                          </td>
                          <td className="right num">{j.runs7d}</td>
                          <td className="small w">{j.lastDetail ?? <span className="dim">-</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {ops.automation.some(j => j.state !== 'healthy') && (
                  <div className="card-f">
                    <Note kind="b">
                      <strong>A scheduled job is not running.</strong> If it has never run, the most
                      likely cause is a missing <span className="mono">CRON_SECRET</span> environment
                      variable in Vercel - the cron request is rejected with a 401 on every attempt and
                      nothing else reports it. Reminders and escalations stop while this is true.
                    </Note>
                  </div>
                )}
              </div>

              <div className="card mb16">
                <div className="card-h">
                  <div>
                    <h3>Continuous audit</h3>
                    <span className="tiny muted">
                      Conditions that are individually legal but operationally wrong ·
                      checked {fmtDateTime(ops.checkedAt)}
                    </span>
                  </div>
                  <button className="btn btn-s no-print" onClick={loadAll}>
                    <Ic n="swap" s={13} /> Re-run
                  </button>
                </div>
                <div className="tw">
                  <table className="dt">
                    <thead><tr>
                      <th className="right" style={{ width: 70 }}>Count</th>
                      <th>Finding</th><th className="w">Examples</th>
                    </tr></thead>
                    <tbody>
                      {ops.anomalies.filter(a => a.count > 0).length === 0 && (
                        <tr><td colSpan={3}><div className="empty">
                          Every check passed. Nothing is unassigned, unevidenced or stalled.
                        </div></td></tr>
                      )}
                      {ops.anomalies.filter(a => a.count > 0).map(a => {
                        const m = ANOMALY_META[a.key] ?? { label: a.key, why: '', tone: 'p-mute' };
                        return (
                          <tr key={a.key}>
                            <td className="right">
                              <BadgeV2 tone={m.tone === 'p-bad' ? 'bad' : m.tone === 'p-warn' ? 'warn' : 'mute'} pulse={m.severe}>{a.count}</BadgeV2>
                            </td>
                            <td>
                              <div className="t1">{m.label}</div>
                              <div className="t2">{m.why}</div>
                            </td>
                            <td className="small w mono dim">
                              {a.sample.length ? a.sample.join(', ') : '-'}
                              {a.count > a.sample.length && a.sample.length > 0 && ` … +${a.count - a.sample.length} more`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid g-3 stagger-in stagger-3">
                <VividKpiCard label="Notifications sent (7d)" value={ops.notifications.sent7d} icon="bell" gradient="var(--grad-primary)" />
                <VividKpiCard label="Unread notifications" value={ops.notifications.unread} icon="bell" gradient="var(--grad-amber)" />
                <VividKpiCard label="Popups awaiting acknowledgement" value={ops.notifications.popupsOpen} icon="alert" gradient="var(--grad-coral)" />
              </div>
            </>
          )}
        </>
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
                    <td className="small w">{a.detail ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {invite && (
        <InviteModal roles={roles} entities={ents} categories={cats}
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
        <ScopeModal user={editUser} entities={ents} roles={roles} categories={cats}
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
function InviteModal({ roles, entities, categories, onClose, onCreated }: {
  roles: Role[]; entities: Ent[]; categories: Cat[];
  onClose: () => void;
  onCreated: (c: { email: string; initialPassword: string; note: string }) => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('PREPARER');
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [allCats, setAllCats] = useState(true);
  const [pickedCats, setPickedCats] = useState<string[]>([]);
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
          category_ids: role === 'PREPARER' && !allCats ? pickedCats : [],
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

      {role === 'PREPARER' && (
        <div className="f">
          <label>Laws this preparer can file</label>
          <label className="small row g6 mb8" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={allCats} onChange={e => setAllCats(e.target.checked)} style={{ width: 'auto' }} />
            All laws
          </label>
          {!allCats && (
            <div style={{
              maxHeight: 190, overflowY: 'auto', border: '1px solid var(--line)',
              borderRadius: 'var(--r)', padding: 8,
            }}>
              {categories.map(cat => (
                <label key={cat.id} className="small row g6" style={{ cursor: 'pointer', padding: '2px 0' }}>
                  <input type="checkbox" checked={pickedCats.includes(cat.id)} style={{ width: 'auto' }}
                         onChange={e => setPickedCats(p => e.target.checked ? [...p, cat.id] : p.filter(x => x !== cat.id))} />
                  {cat.name}
                </label>
              ))}
            </div>
          )}
          <div className="h">
            Restricting this leaves every other law invisible to this preparer -
            in the register and when filing. Leave "All laws" ticked for no restriction.
          </div>
        </div>
      )}

      <div className="f">
        <label className="small row g6" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={approve} onChange={e => setApprove(e.target.checked)} style={{ width: 'auto' }} />
          Approve this account immediately
        </label>
        <div className="h">
          Leave unticked to create it as pending, which is the safer default - someone then has to
          approve it before the person can sign in.
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------- scope */
function ScopeModal({ user, entities, roles, categories, onClose, onSaved }: {
  user: User; entities: Ent[]; roles: Role[]; categories: Cat[]; onClose: () => void; onSaved: () => void;
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
  const [allCats, setAllCats] = useState(!(user.category_ids?.length));
  const [pickedCats, setPickedCats] = useState<string[]>(user.category_ids ?? []);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: user.id, role_id: role, full_name: name,
          entities: all ? ['*'] : picked, can_file: canFile, can_review: canReview,
          category_ids: allCats ? [] : pickedCats,
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

      {role === 'PREPARER' && (
        <div className="f">
          <label>Laws this preparer can file</label>
          <label className="small row g6 mb8" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={allCats} onChange={e => setAllCats(e.target.checked)} style={{ width: 'auto' }} />
            All laws
          </label>
          {!allCats && (
            <div style={{ maxHeight: 190, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 8 }}>
              {categories.map(cat => (
                <label key={cat.id} className="small row g6" style={{ cursor: 'pointer', padding: '2px 0' }}>
                  <input type="checkbox" checked={pickedCats.includes(cat.id)} style={{ width: 'auto' }}
                         onChange={e => setPickedCats(p => e.target.checked ? [...p, cat.id] : p.filter(x => x !== cat.id))} />
                  {cat.name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

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
            <option key={c.id} value={c.id}>{c.full_name} - {c.role_name}</option>
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
