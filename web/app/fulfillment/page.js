'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Shell, { Notice, Status, useSession } from '../../components/Shell';
import OrderActions from '../../components/OrderActions';
import { api, when } from '../../lib/api';

const TABS = ['confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];

function Queue() {
  const user = useSession();
  const [tab, setTab] = useState('confirmed');
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api(`/orders?status=${tab}`).then(setOrders).catch((e) => setError(e.message)), [tab]);
  useEffect(() => { setOrders(null); load(); }, [load]);
  return (
    <>
      <h1>Fulfillment</h1>
      <div className="tabs">{TABS.map((t) => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
      <Notice error={error} />
      {orders && !orders.length && <p className="muted">No {tab} orders.</p>}
      {orders?.map((o) => (
        <div className="card" key={o.id}>
          <div className="row"><Link href={`/orders/${o.id}`}><strong>{o.id.slice(0, 8)}</strong></Link>
            <span>{o.customer_name}</span><Status value={o.status} /><span className="grow" /><span className="muted">{when(o.created_at)}</span></div>
          <div>{o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</div>
          <OrderActions order={o} user={user} onDone={load} />
        </div>
      ))}
    </>
  );
}
export default function Fulfillment() {
  return <Shell roles={['warehouse', 'admin']}><Queue /></Shell>;
}
