'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell, { Notice, Status } from '../../components/Shell';
import { api, when } from '../../lib/api';

export default function Orders() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/orders').then(setOrders).catch((e) => setError(e.message)); }, []);
  return (
    <Shell roles={['customer']}>
      <h1>My orders</h1>
      <Notice error={error} />
      {orders && !orders.length && <p className="muted">No orders yet. <Link href="/shop">Place one.</Link></p>}
      {!!orders?.length && (
        <div className="scroll"><table>
          <thead><tr><th>Order</th><th>Placed</th><th>Items</th><th>Status</th></tr></thead>
          <tbody>{orders.map((o) => (
            <tr key={o.id}>
              <td><Link href={`/orders/${o.id}`}>{o.id.slice(0, 8)}</Link></td><td>{when(o.created_at)}</td>
              <td>{o.items.map((i) => `${i.quantity} × ${i.name}`).join(', ')}</td><td><Status value={o.status} /></td>
            </tr>))}
          </tbody>
        </table></div>
      )}
    </Shell>
  );
}
