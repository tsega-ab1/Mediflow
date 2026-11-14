'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell, { Notice } from '../../components/Shell';
import { api, money } from '../../lib/api';

export default function Shop() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [qty, setQty] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/catalog/products').then(setProducts).catch((e) => setError(e.message)); }, []);
  const items = Object.entries(qty).filter(([, q]) => q > 0).map(([product_id, quantity]) => ({ product_id, quantity }));

  async function place() {
    setBusy(true); setError('');
    try {
      const order = await api('/orders', { method: 'POST', body: { items } });
      router.push(`/orders/${order.id}`);
    } catch (e) { setError(e.message); setBusy(false); }
  }
  return (
    <Shell roles={['customer']}>
      <h1>Place an order</h1>
      <div className="scroll">
        <table>
          <thead><tr><th>Product</th><th>SKU</th><th>Strength</th><th>Unit</th><th>Price</th><th>Quantity</th></tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td><td>{p.sku}</td><td>{p.strength || '—'}</td><td>{p.unit}</td><td>{money(p.price_cents)}</td>
                <td><input type="number" min="0" value={qty[p.id] ?? ''} placeholder="0"
                  onChange={(e) => setQty({ ...qty, [p.id]: parseInt(e.target.value, 10) || 0 })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Notice error={error} />
      <div className="actions">
        <button disabled={!items.length || busy} onClick={place}>Place order ({items.length} item{items.length === 1 ? '' : 's'})</button>
      </div>
    </Shell>
  );
}
