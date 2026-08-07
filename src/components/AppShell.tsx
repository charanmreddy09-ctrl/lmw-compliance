'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Ic, ToastHost, Modal, initials, fmtDateTime, Spinner } from '@/components/ui';
import type { SessionUser } from '@/lib/rbac';

type Notif = {
  id: number; country_code: string | null; entity_id: string | null; kind: string;
  title: string; body: string | null; link: string | null; severity: string;
  is_popup: boolean; read_at: string | null; created_at: string;
};

type NavItem = { href: string; label: string; icon: string; show: (u: SessionUser) => boolean };

const has = (u: SessionUser, p: string) => u.permissions.includes(p as never);

/* The CFO monitors, delegates and reports. Reviewing individual filings and
   working the preparer's register are deliberately not part of that role. */
const isCfo = (u: SessionUser) => u.role === 'CFO';

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: 'dash', show: () => true },
      { href: '/entities', label: 'Entities', icon: 'building', show: () => true },
    ],
  },
  {
    section: 'Compliance',
    items: [
      { href: '/compliance', label: 'Compliance library', icon: 'book',
        show: u => has(u, 'compliance.library') || has(u, 'compliance.verify') },
      { href: '/register', label: 'Compliance register', icon: 'list',
        show: u => !isCfo(u) },
      { href: '/calendar', label: 'Compliance calendar', icon: 'cal', show: () => true },
      { href: '/reviews', label: 'Reviews', icon: 'review',
        show: u => has(u, 'compliance.review') && !isCfo(u) },
      { href: '/exclusions', label: 'Not applicable', icon: 'trash',
        show: u => has(u, 'compliance.review') },
    ],
  },
  {
    section: 'Governance',
    items: [
      { href: '/reports', label: 'Reports', icon: 'report', show: u => has(u, 'reports.generate') },
      { href: '/admin', label: 'Administration', icon: 'gear',
        show: u => has(u, 'users.manage') || has(u, 'delegation.manage') || has(u, 'audit.view') },
    ],
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [popups, setPopups] = useState<Notif[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [clock, setClock] = useState<Date | null>(null);

  /* sidebar collapse — remembered per browser, so it survives navigation */
  useEffect(() => {
    setCollapsed(localStorage.getItem('sgcmp_sidebar_collapsed') === '1');
  }, []);
  function toggleCollapsed() {
    setCollapsed(c => {
      localStorage.setItem('sgcmp_sidebar_collapsed', c ? '0' : '1');
      return !c;
    });
  }

  /* live clock next to sign-out */
  useEffect(() => {
    setClock(new Date());
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* -------------------------------------------------------------- session */
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        if (!live) return;
        if (!data.user) {
          /* The cookie can be a validly-signed JWT for a user that no longer
             exists (deleted, or the database was reseeded) — middleware only
             checks the signature, so it still treats the request as signed
             in and would bounce /signin straight back here, looping forever.
             Clearing the cookie server-side before leaving breaks that loop. */
          await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
          router.replace('/signin');
          return;
        }
        setUser(data.user);
      } catch {
        if (live) router.replace('/signin');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [router]);

  /* -------------------------------------------------- notifications + popup */
  const loadNotifs = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = await res.json();
      setNotifs(data.notifications ?? []);
      setUnread(data.unread ?? 0);
      const pop = (data.notifications as Notif[]).filter(n => n.is_popup && !n.read_at);
      if (pop.length) setPopups(pop);
    } catch { /* a failed poll must never break the page */ }
  }, []);

  useEffect(() => {
    if (!user) return;
    loadNotifs();
    const t = setInterval(loadNotifs, 60_000);
    return () => clearInterval(t);
  }, [user, loadNotifs]);

  /* pending review badge */
  useEffect(() => {
    if (!user || !user.permissions.includes('compliance.review') || isCfo(user)) return;
    (async () => {
      try {
        const res = await fetch('/api/reviews');
        if (!res.ok) return;
        const d = await res.json();
        setReviewCount(
          (d.queue as { status: string }[]).filter(r => r.status === 'Submitted' || r.status === 'Under Review').length
        );
      } catch { /* badge is cosmetic */ }
    })();
  }, [user, pathname]);

  async function dismissPopups() {
    const ids = popups.map(p => p.id);
    setPopups([]);
    setUnread(u => Math.max(0, u - ids.length));
    setNotifs(ns => ns.map(n => ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n));
    try { await fetch('/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) }); } catch { /* ignore */ }
  }

  async function markAllRead() {
    setUnread(0);
    setNotifs(ns => ns.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    try { await fetch('/api/notifications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ all: true }) }); } catch { /* ignore */ }
  }

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/signin');
  }

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <Spinner label="Loading the platform…" />
      </div>
    );
  }
  if (!user) return null;

  const crumb = NAV.flatMap(s => s.items).find(i => pathname.startsWith(i.href));

  /* group the popup notifications by country, which is how the requirement reads */
  const byCountry = popups.reduce<Record<string, Notif[]>>((acc, n) => {
    const k = n.country_code ?? 'Group';
    (acc[k] ??= []).push(n);
    return acc;
  }, {});

  return (
    <ToastHost>
      <div className={`app${collapsed ? ' collapsed' : ''}`}>
        <aside className={`side${sideOpen ? ' open' : ''}${collapsed ? ' collapsed' : ''}`}>
          <Link href="/dashboard" className="brand" style={{ textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://www.lmwglobal.com/images/lmw-logo.png" alt="LMW"
                 style={{ height: 24, width: 'auto', background: '#fff', borderRadius: 2, padding: '2px 4px' }} />
            {!collapsed && (
              <div>
                <div className="bt">LMW Compliance Platform</div>
                <div className="bs">Control Tower</div>
              </div>
            )}
          </Link>

          <nav className="nav">
            {NAV.map(sec => {
              const items = sec.items.filter(i => i.show(user));
              if (!items.length) return null;
              return (
                <div key={sec.section}>
                  {!collapsed && <div className="nav-sec">{sec.section}</div>}
                  {items.map(i => (
                    <Link key={i.href} href={i.href}
                          className={`nav-a${pathname.startsWith(i.href) ? ' on' : ''}`}
                          onClick={() => setSideOpen(false)} title={collapsed ? i.label : undefined}>
                      <Ic n={i.icon} s={15} />
                      {!collapsed && <span>{i.label}</span>}
                      {i.href === '/reviews' && reviewCount ? (
                        <span className={`ct${reviewCount > 0 ? ' alert' : ''}`}>{reviewCount}</span>
                      ) : null}
                    </Link>
                  ))}
                </div>
              );
            })}
          </nav>

          {!collapsed && (
            <div className="side-foot">
              <div className="strong" style={{ color: '#C6D3E8' }}>{user.roleName}</div>
              <div>{user.entities.includes('*') ? 'All entities' : `${user.entities.length} entities assigned`}</div>
              <div className="mt8" style={{ opacity: .7 }}>Version 1.0</div>
            </div>
          )}

          <button className="side-collapse no-print" onClick={toggleCollapsed}
                  aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                  title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <Ic n={collapsed ? 'chevR' : 'chev'} s={13} />
          </button>
        </aside>

        <div className="main">
          <header className="topbar">
            <button className="iconbtn no-print" onClick={() => setSideOpen(o => !o)}
                    aria-label="Toggle navigation"
                    style={{ display: 'none' }} id="navToggle"><Ic n="menu" s={18} /></button>

            <button className="iconbtn no-print" onClick={toggleCollapsed}
                    aria-label={collapsed ? 'Show sidebar' : 'Hide sidebar'}
                    title={collapsed ? 'Show sidebar' : 'Hide sidebar'}>
              <Ic n="menu" s={17} />
            </button>

            <div className="grow">
              <div className="crumbs">
                LMW Limited <span style={{ opacity: .5 }}>/</span> <b>{crumb?.label ?? 'Platform'}</b>
              </div>
              <h1>{crumb?.label ?? 'Compliance Platform'}</h1>
            </div>

            {clock && (
              <div className="tiny muted num no-print" style={{ whiteSpace: 'nowrap' }}>
                {clock.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                {' · '}
                {clock.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
            )}

            <button className="iconbtn no-print" onClick={() => setDrawer(true)} aria-label="Notifications">
              <Ic n="bell" s={17} />
              {unread > 0 && <span className="pip" />}
            </button>

            <div className="who no-print" onClick={signOut} title="Sign out" role="button" tabIndex={0}
                 onKeyDown={e => { if (e.key === 'Enter') signOut(); }}>
              <span className="av">{initials(user.name)}</span>
              <div>
                <div className="wn">{user.name}</div>
                <div className="wr">{user.email}</div>
              </div>
              <span style={{ color: 'var(--ink-4)', marginLeft: 4 }}><Ic n="out" s={15} /></span>
            </div>
          </header>

          <main className="content">{children}</main>
        </div>
      </div>

      {/* ----------------------------------------- country-specific due date popup */}
      {popups.length > 0 && (
        <Modal
          title={
            Object.keys(byCountry).length === 1
              ? `Due date changes — ${Object.keys(byCountry)[0]}`
              : 'Due date and workflow changes'
          }
          sub="Requires your attention"
          onClose={dismissPopups}
          footer={
            <>
              <Link href="/calendar" className="btn" onClick={dismissPopups}>Open calendar</Link>
              <button className="btn btn-p" onClick={dismissPopups}>Acknowledge</button>
            </>
          }
        >
          <p className="small muted mb12">
            The following changes affect entities you are assigned to. Dashboards, tasks
            and reports have already been updated.
          </p>
          {Object.entries(byCountry).map(([cc, list]) => (
            <div className="mb16" key={cc}>
              <div className="row g8 mb8">
                <Ic n="globe" s={14} />
                <span className="cap" style={{ fontSize: 10.5 }}>{cc === 'Group' ? 'Group-wide' : cc}</span>
                <span className="pill p-warn nd">{list.length}</span>
              </div>
              {list.map(n => (
                <div key={n.id} className={`note note-${n.severity === 'critical' ? 'b' : n.severity === 'warning' ? 'w' : 'i'} mb8`}>
                  <span style={{ marginTop: 1 }}><Ic n={n.severity === 'info' ? 'info' : 'alert'} s={15} /></span>
                  <div>
                    <div className="strong">{n.title}</div>
                    <div className="small mt4">{n.body}</div>
                    <div className="tiny dim mt4">{fmtDateTime(n.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </Modal>
      )}

      {/* ------------------------------------------------- notification drawer */}
      {drawer && (
        <Modal title="Notifications" sub={`${unread} unread`} onClose={() => setDrawer(false)}
               footer={
                 <>
                   <button className="btn" onClick={markAllRead} disabled={!unread}>Mark all as read</button>
                   <button className="btn btn-p" onClick={() => setDrawer(false)}>Close</button>
                 </>
               }>
          {notifs.length === 0 && <div className="empty">Nothing to show yet.</div>}
          {notifs.map(n => (
            <div key={n.id} className="row-t g8" style={{
              padding: '9px 0', borderBottom: '1px solid var(--line-2)',
              opacity: n.read_at ? .62 : 1,
            }}>
              <span style={{
                marginTop: 3, color: n.severity === 'critical' ? 'var(--bad-600)'
                  : n.severity === 'warning' ? 'var(--warn-600)' : 'var(--navy-600)',
              }}>
                <Ic n={n.severity === 'info' ? 'info' : 'alert'} s={15} />
              </span>
              <div className="grow">
                <div className="row between g8">
                  <span className="strong small">{n.title}</span>
                  {n.country_code && <span className="pill p-mute nd tiny">{n.country_code}</span>}
                </div>
                <div className="small muted mt4">{n.body}</div>
                <div className="row between mt4">
                  <span className="tiny dim">{fmtDateTime(n.created_at)}</span>
                  {n.link && (
                    <Link href={n.link} className="tiny strong" onClick={() => setDrawer(false)}>Open</Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </Modal>
      )}

      <style>{`@media (max-width: 860px) { #navToggle { display: inline-flex !important; } }`}</style>
    </ToastHost>
  );
}
