'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Shell, { Notice, Status, useSession } from '../../components/Shell';
import { api, day } from '../../lib/api';

function Inventory() {
  const user = useSession();
  const canEdit = user.role === 'inventory_manager' || user.role === 'admin';
  const [batches, setBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [msg, setMsg] = useState({});
  const [form, setForm] = useState({ product_id: '', batch_number: '', expiry_date: '', quantity: '' });

  const load = useCallback(async () => {
    try { setBatches(await api('/inventory/batches')); setProducts(await api('/catalog/products')); }
    catch (e) { setMsg({ error: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const name = (id) => products.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  async function receive(e) {
    e.preventDefault(); setMsg({});
    try {
      await api('/inventory/batches', { method: 'POST', body: { ...form, quantity: parseInt(form.quantity, 10) } });
      setForm({ product_id: '', batch_number: '', expiry_date: '', quantity: '' });
      setMsg({ ok: 'Batch received.' }); load();
    } catch (err) { setMsg({ error: err.message }); }
  }
  async function setStatus(b, status) {
    if (status === 'recalled' && !confirm(`Recall batch ${b.batch_number}? This cannot be undone.`)) return;
    setMsg({});
    try {
      const r = await api(`/inventory/batches/${b.id}/status`, { method: 'PATCH', body: { status } });
      const n = r.affected_order_ids.length;
      setMsg({ ok: `Batch ${b.batch_number} is now ${status}.${n ? ` ${n} open order(s) hold stock from it and cannot ship until cancelled.` : ''}` });
      load();
    } catch (err) { setMsg({ error: err.message }); }
  }

  return (
    <>
      <h1>Inventory</h1>
      <Notice error={msg.error} ok={msg.ok} />
      {canEdit && (
        <form className="card row" onSubmit={receive}>
          <select required value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
            <option value="">Product…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} {p.strength}</option>)}
          </select>
          <input required placeholder="Batch number" value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} />
          <input required type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
          <input required type="number" min="1" placeholder="Qty" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
          <button type="submit">Receive batch</button>
        </form>
      )}
      <div className="scroll"><table>
        <thead><tr><th>Product</th><th>Batch</th><th>Expiry</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Status</th>{canEdit && <th />}</tr></thead>
        <tbody>{batches.map((b) => (
          <tr key={b.id}>
            <td>{name(b.product_id)}</td><td>{b.batch_number}</td><td>{day(b.expiry_date)}</td>
            <td>{b.on_hand}</td><td>{b.reserved}</td><td>{b.available}</td><td><Status value={b.status} /></td>
            {canEdit && <td className="row">
              {b.status === 'active' && <button className="ghost" onClick={() => setStatus(b, 'quarantined')}>Quarantine</button>}
              {b.status === 'quarantined' && <button className="ghost" onClick={() => setStatus(b, 'active')}>Release</button>}
              {b.status !== 'recalled' && <button className="danger" onClick={() => setStatus(b, 'recalled')}>Recall</button>}
            </td>}
          </tr>))}
        </tbody>
      </table></div>
      <p className="muted">Batches that expire soon, or are quarantined or recalled, are never allocated to new orders.</p>
    </>
  );
}
export default function InventoryPage() {
  return <Shell roles={['warehouse', 'inventory_manager', 'admin']}><Inventory /></Shell>;
}
