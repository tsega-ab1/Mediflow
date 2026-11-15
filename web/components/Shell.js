'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { api, getSession, homeFor } from '../lib/api';

const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

const NAV = [
  ['/shop', 'Shop', ['customer']],
  ['/orders', 'Orders', ['customer']],
  ['/fulfillment', 'Fulfillment', ['warehouse', 'admin']],
  ['/inventory', 'Inventory', ['warehouse', 'inventory_manager', 'admin']],
  ['/invoices', 'Invoices', ['customer', 'admin']],
  ['/reports', 'Reports', ['inventory_manager', 'admin']],
  ['/admin', 'Admin', ['admin']],
];

export default function Shell({ roles, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const s = getSession();
    if (!s) return router.replace('/login');
    if (roles && !roles.includes(s.user.role)) return router.replace(homeFor(s.user.role));
    setSession(s);
  }, []);

  useEffect(() => {
    if (!session) return;
    const load = () => api('/notifications/unread-count').then((r) => setUnread(r.count)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [session]);

  if (!session) return <p className="muted pad">Loading…</p>;
  const { user } = session;
  const logout = () => { localStorage.clear(); router.replace('/login'); };

  return (
    <SessionContext.Provider value={user}>
      <header className="bar">
        <strong>MediFlow</strong>
        <nav>
          {NAV.filter(([, , r]) => r.includes(user.role)).map(([href, label]) => (
            <Link key={href} href={href} className={pathname.startsWith(href) ? 'active' : ''}>{label}</Link>
          ))}
          <Link href="/notifications" className={pathname.startsWith('/notifications') ? 'active' : ''}>
            Notifications{unread > 0 && <span className="count">{unread}</span>}
          </Link>
        </nav>
        <span className="grow" />
        <span className="muted">{user.email} · {user.role.replace('_', ' ')}</span>
        <button className="ghost" onClick={logout}>Log out</button>
      </header>
      <main className="page">{children}</main>
    </SessionContext.Provider>
  );
}

export function Notice({ error, ok }) {
  if (error) return <p className="notice error">{error}</p>;
  if (ok) return <p className="notice ok">{ok}</p>;
  return null;
}

export const Status = ({ value }) => <span className={`badge ${value}`}>{value}</span>;
