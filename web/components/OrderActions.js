'use client';
import { useState } from 'react';
import { api } from '../lib/api';
import { Notice } from './Shell';

const NEXT = { confirmed: ['packed', 'Mark packed'], packed: ['shipped', 'Mark shipped'], shipped: ['delivered', 'Mark delivered'] };
const CANCEL = { customer: ['placed', 'confirmed'], warehouse: ['placed', 'confirmed', 'packed'], admin: ['placed', 'confirmed', 'packed'] };

export default function OrderActions({ order, user, onDone }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const staff = user.role === 'warehouse' || user.role === 'admin';
  const next = staff ? NEXT[order.status] : null;
  const canCancel = (CANCEL[user.role] || []).includes(order.status);

  async function run(path, body) {
    setBusy(true); setError('');
    try { await api(path, { method: 'POST', body }); await onDone(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  if (!next && !canCancel) return null;
  return (
    <div className="actions">
      {next && <button disabled={busy} onClick={() => run(`/orders/${order.id}/status`, { status: next[0] })}>{next[1]}</button>}
      {canCancel && (
        <button className="danger" disabled={busy}
          onClick={() => confirm('Cancel this order and release its stock?') && run(`/orders/${order.id}/cancel`)}>
          Cancel order
        </button>
      )}
      <Notice error={error} />
    </div>
  );
}
