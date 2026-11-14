'use client';
import { useCallback, useEffect, useState } from 'react';
import Shell, { Notice, Status, useSession } from '../../../components/Shell';
import OrderActions from '../../../components/OrderActions';
import { api, day, when } from '../../../lib/api';

function Detail({ id }) {
  const user = useSession();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api(`/orders/${id}`).then(setOrder).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <Notice error={error} />;
  if (!order) return <p className="muted">Loading…</p>;
  return (
    <>
      <h1>Order {order.id.slice(0, 8)} <Status value={order.status} /></h1>
      {order.customer_name && <p className="muted">Customer: {order.customer_name}</p>}
      <OrderActions order={order} user={user} onDone={load} />
      <h2>Items</h2>
      <table>
        <thead><tr><th>Product</th><th>SKU</th><th>Quantity</th></tr></thead>
        <tbody>{order.items.map((i) => <tr key={i.product_id}><td>{i.name}</td><td>{i.sku}</td><td>{i.quantity}</td></tr>)}</tbody>
      </table>
      {order.batches && (
        <>
          <h2>Batches (traceability)</h2>
          <table>
            <thead><tr><th>Batch</th><th>Expiry</th><th>Quantity</th><th>State</th><th>Batch status</th></tr></thead>
            <tbody>{order.batches.map((b, k) => (
              <tr key={k}><td>{b.batch_number}</td><td>{day(b.expiry_date)}</td><td>{b.quantity}</td>
                <td>{b.shipped_at ? 'shipped' : b.released_at ? 'released' : 'reserved'}</td><td><Status value={b.batch_status} /></td></tr>
            ))}</tbody>
          </table>
        </>
      )}
      <h2>History</h2>
      <ul className="timeline">
        {order.history.map((h, k) => <li key={k}><Status value={h.to_status} /> <span className="muted">{when(h.created_at)}</span></li>)}
      </ul>
    </>
  );
}

export default function OrderPage({ params }) {
  return <Shell roles={['customer', 'warehouse', 'admin']}><Detail id={params.id} /></Shell>;
}
