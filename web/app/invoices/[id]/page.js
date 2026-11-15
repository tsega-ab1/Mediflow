'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Shell, { Notice, Status, useSession } from '../../../components/Shell';
import { api, day, money, when } from '../../../lib/api';

function Detail({ id }) {
  const user = useSession();
  const [inv, setInv] = useState(null);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => api(`/billing/invoices/${id}`).then(setInv).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  async function pay() {
    setError('');
    try { await api(`/billing/invoices/${id}/pay`, { method: 'POST', body: { reference } }); load(); }
    catch (e) { setError(e.message); }
  }
  if (error && !inv) return <Notice error={error} />;
  if (!inv) return <p className="muted">Loading…</p>;
  return (
    <div className="card invoice">
      <div className="row"><h1>Invoice {inv.number}</h1><span className="grow" /><Status value={inv.overdue ? 'overdue' : inv.status} /></div>
      <p>Billed to <strong>{inv.customer_name}</strong><br />
        Issued {day(inv.issued_at)} · Due {day(inv.due_at)}
        {inv.paid_at && <><br />Paid {when(inv.paid_at)}{inv.payment_reference ? ` · ref ${inv.payment_reference}` : ''}</>}</p>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th className="right">Unit price</th><th className="right">Amount</th></tr></thead>
        <tbody>
          {inv.lines.map((l) => <tr key={l.id}><td>{l.description}</td><td>{l.quantity}</td><td className="right">{money(l.unit_price_cents)}</td><td className="right">{money(l.line_total_cents)}</td></tr>)}
          <tr><td colSpan="3"><strong>Total</strong></td><td className="right"><strong>{money(inv.total_cents)}</strong></td></tr>
        </tbody>
      </table>
      <Notice error={error} />
      <div className="actions">
        <button className="ghost" onClick={() => window.print()}>Print / save as PDF</button>
        {user.role === 'admin' && inv.status === 'issued' && (
          <>
            <input placeholder="Payment reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
            <button onClick={pay}>Mark paid</button>
          </>
        )}
      </div>
    </div>
  );
}
export default function InvoicePage() {
  const { id } = useParams();
  return <Shell roles={['customer', 'admin']}><Detail id={id} /></Shell>;
}
