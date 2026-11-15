'use client';
import { useCallback, useEffect, useState } from 'react';
import Shell, { Notice } from '../../components/Shell';
import { api, day, downloadFile, money } from '../../lib/api';

function Report() {
  const [data, setData] = useState(null);
  const [low, setLow] = useState(20);
  const [days, setDays] = useState(120);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    api(`/reports/overview?low_stock=${low}&expiring_days=${days}`).then(setData).catch((e) => setError(e.message));
  }, [low, days]);
  useEffect(() => { load(); }, [load]);

  const Stat = ({ label, value }) => <div className="stat"><span className="muted">{label}</span><b>{value}</b></div>;
  return (
    <>
      <div className="row"><h1>Reports</h1><span className="grow" />
        <button className="ghost" onClick={() => downloadFile('/reports/stock.csv', 'stock.csv').catch((e) => setError(e.message))}>Download stock CSV</button></div>
      <div className="card row">
        <label>Low stock at or below <input type="number" min="0" value={low} onChange={(e) => setLow(parseInt(e.target.value, 10) || 0)} /></label>
        <label>Expiring within <input type="number" min="1" value={days} onChange={(e) => setDays(parseInt(e.target.value, 10) || 1)} /> days</label>
      </div>
      <Notice error={error} />
      {data && (
        <>
          <div className="stats">
            <Stat label="Orders, last 30 days" value={data.orders.placed_last_30_days} />
            {['confirmed', 'packed', 'shipped', 'delivered', 'cancelled'].map((s) => <Stat key={s} label={s} value={data.orders.by_status[s] ?? 0} />)}
          </div>
          {data.billing && (
            <div className="stats">
              <Stat label="Invoiced, last 30 days" value={money(data.billing.invoiced_last_30_days)} />
              <Stat label="Outstanding" value={money(data.billing.outstanding)} />
              <Stat label={`Overdue (${data.billing.overdue_count})`} value={money(data.billing.overdue_total)} />
            </div>
          )}
          <h2>Top products, last 30 days</h2>
          {!data.top_products.length ? <p className="muted">No orders yet.</p> : (
            <table><thead><tr><th>Product</th><th>SKU</th><th>Units ordered</th></tr></thead>
              <tbody>{data.top_products.map((p) => <tr key={p.product_id}><td>{p.name}</td><td>{p.sku}</td><td>{p.quantity}</td></tr>)}</tbody></table>
          )}
          <h2>Low stock (sellable at or below {data.thresholds.low_stock})</h2>
          {!data.low_stock.length ? <p className="muted">Nothing is running low.</p> : (
            <table><thead><tr><th>Product</th><th>SKU</th><th>Sellable</th><th>On hand</th><th>Reserved</th></tr></thead>
              <tbody>{data.low_stock.map((p) => <tr key={p.product_id}><td>{p.name}</td><td>{p.sku}</td><td><strong>{p.sellable}</strong></td><td>{p.on_hand}</td><td>{p.reserved}</td></tr>)}</tbody></table>
          )}
          <h2>Batches expiring within {data.thresholds.expiring_days} days</h2>
          {!data.expiring_batches.length ? <p className="muted">No batches expiring in this window.</p> : (
            <table><thead><tr><th>Product</th><th>Batch</th><th>Expiry</th><th>On hand</th></tr></thead>
              <tbody>{data.expiring_batches.map((b) => <tr key={b.id}><td>{b.name}</td><td>{b.batch_number}</td><td>{day(b.expiry_date)}</td><td>{b.on_hand}</td></tr>)}</tbody></table>
          )}
          <p className="muted">"Sellable" is stock new orders can actually get: active batches that are not near expiry, minus reservations.</p>
        </>
      )}
    </>
  );
}
export default function ReportsPage() {
  return <Shell roles={['inventory_manager', 'admin']}><Report /></Shell>;
}
