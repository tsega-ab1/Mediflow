'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell, { Notice, useSession } from '../../components/Shell';
import { api, when } from '../../lib/api';

function Inbox() {
  const router = useRouter();
  const user = useSession();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api('/notifications').then(setItems).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  // Where a notification leads, depending on who is reading it.
  function target(n) {
    if (n.entity === 'order' && user.role !== 'inventory_manager') return `/orders/${n.entity_id}`;
    if (n.entity === 'invoice' && ['customer', 'admin'].includes(user.role)) return `/invoices/${n.entity_id}`;
    if (n.entity === 'batch') return '/inventory';
    return null;
  }
  async function open(n) {
    if (!n.read_at) await api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    const t = target(n);
    if (t) router.push(t); else load();
  }
  async function readAll() { await api('/notifications/read-all', { method: 'POST' }); load(); }

  return (
    <>
      <div className="row"><h1>Notifications</h1><span className="grow" /><button className="ghost" onClick={readAll}>Mark all read</button></div>
      <Notice error={error} />
      {items && !items.length && <p className="muted">Nothing yet.</p>}
      {items?.map((n) => (
        <div className="card" key={n.id} style={{ cursor: 'pointer' }} onClick={() => open(n)}>
          <div className={n.read_at ? '' : 'unread'}>{n.title}</div>
          <div className="muted">{n.body}</div>
          <div className="muted">{when(n.created_at)}</div>
        </div>
      ))}
    </>
  );
}
export default function NotificationsPage() {
  return <Shell><Inbox /></Shell>;
}
