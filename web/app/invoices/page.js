'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Shell, { Notice, Status, useSession } from '../../components/Shell';
import { api, day, money } from '../../lib/api';

const FILTERS = ['all', 'issued', 'overdue', 'paid'];

function List() {
  const user = useSession();
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api(`/billing/invoices${filter === 'all' ? '' : `?status=${filter}`}`).then(setRows).catch((e) => setError(e.message)), [filter]);
  useEffect(() => { setRows(null); load(); }, [load]);

  async function pay(inv) {
    const reference = prompt(`Record payment for ${inv.number}. Reference (optional):`);
    if (reference === null) return;
    try { await api(`/billing/invoices/${inv.id}/pay`, { method: 'POST', body: { reference } }); load(); }
    catch (e) { setError(e.message); }
  }
  return (
    <>
      <h1>Invoices</h1>
      <div className="tabs">{FILTERS.map((f) => <button key={f} className={f === filter ? 'on' : ''} onClick={() => setFilter(f)}>{f}</button>)}</div>
      <Notice error={error} />
      {rows && !rows.length && <p className="muted">No invoices.</p>}
      {!!rows?.length && (
        <div className="scroll"><table>
          <thead><tr><th>Invoice</th>{user.role === 'admin' && <th>Customer</th>}<th>Issued</th><th>Due</th><th className="right">Total</th><th>Status</th>{user.role === 'admin' && <th />}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td><Link href={`/invoices/${r.id}`}>{r.number}</Link></td>
              {user.role === 'admin' && <td>{r.customer_name}</td>}
              <td>{day(r.issued_at)}</td><td>{day(r.due_at)}</td><td className="right">{money(r.total_cents)}</td>
              <td><Status value={r.overdue ? 'overdue' : r.status} /></td>
              {user.role === 'admin' && <td>{r.status === 'issued' && <button onClick={() => pay(r)}>Mark paid</button>}</td>}
            </tr>))}
          </tbody>
        </table></div>
      )}
    </>
  );
}
export default function InvoicesPage() {
  return <Shell roles={['customer', 'admin']}><List /></Shell>;
}
