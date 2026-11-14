'use client';
import { useCallback, useEffect, useState } from 'react';
import Shell, { Notice } from '../../components/Shell';
import { api, money, when } from '../../lib/api';

const TABS = ['products', 'people', 'audit'];

function Products() {
  const [list, setList] = useState([]);
  const [f, setF] = useState({ name: '', sku: '', strength: '', unit: '', price: '' });
  const [msg, setMsg] = useState({});
  const load = useCallback(() => api('/catalog/products').then(setList).catch((e) => setMsg({ error: e.message })), []);
  useEffect(() => { load(); }, [load]);
  async function add(e) {
    e.preventDefault(); setMsg({});
    try {
      await api('/catalog/products', { method: 'POST', body: { name: f.name, sku: f.sku, strength: f.strength || null, unit: f.unit, price_cents: Math.round(parseFloat(f.price) * 100) } });
      setF({ name: '', sku: '', strength: '', unit: '', price: '' }); load();
    } catch (err) { setMsg({ error: err.message }); }
  }
  async function deactivate(p) {
    try { await api(`/catalog/products/${p.id}`, { method: 'PATCH', body: { active: false } }); load(); } catch (err) { setMsg({ error: err.message }); }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <form className="card row" onSubmit={add}>
        <input required placeholder="Name" value={f.name} onChange={set('name')} />
        <input required placeholder="SKU" value={f.sku} onChange={set('sku')} />
        <input placeholder="Strength" value={f.strength} onChange={set('strength')} />
        <input required placeholder="Unit" value={f.unit} onChange={set('unit')} />
        <input required type="number" step="0.01" min="0" placeholder="Price" value={f.price} onChange={set('price')} />
        <button type="submit">Add product</button>
      </form>
      <Notice error={msg.error} />
      <table><thead><tr><th>Name</th><th>SKU</th><th>Strength</th><th>Unit</th><th>Price</th><th /></tr></thead>
        <tbody>{list.map((p) => (
          <tr key={p.id}><td>{p.name}</td><td>{p.sku}</td><td>{p.strength || '—'}</td><td>{p.unit}</td><td>{money(p.price_cents)}</td>
            <td><button className="ghost" onClick={() => deactivate(p)}>Deactivate</button></td></tr>))}
        </tbody></table>
    </>
  );
}

function People() {
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [cname, setCname] = useState('');
  const [u, setU] = useState({ email: '', password: '', role: 'customer', customer_id: '' });
  const [msg, setMsg] = useState({});
  const load = useCallback(async () => {
    try { setCustomers(await api('/identity/customers')); setUsers(await api('/identity/users')); }
    catch (e) { setMsg({ error: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function addCustomer(e) {
    e.preventDefault(); setMsg({});
    try { await api('/identity/customers', { method: 'POST', body: { name: cname } }); setCname(''); load(); } catch (err) { setMsg({ error: err.message }); }
  }
  async function addUser(e) {
    e.preventDefault(); setMsg({});
    try {
      await api('/identity/users', { method: 'POST', body: { ...u, customer_id: u.role === 'customer' ? u.customer_id : undefined } });
      setU({ ...u, email: '', password: '' }); setMsg({ ok: 'User created.' }); load();
    } catch (err) { setMsg({ error: err.message }); }
  }
  const cname_of = (id) => customers.find((c) => c.id === id)?.name ?? '—';
  return (
    <>
      <Notice error={msg.error} ok={msg.ok} />
      <form className="card row" onSubmit={addCustomer}>
        <input required placeholder="New customer (pharmacy or clinic)" value={cname} onChange={(e) => setCname(e.target.value)} />
        <button type="submit">Add customer</button>
      </form>
      <form className="card row" onSubmit={addUser}>
        <input required type="email" placeholder="Email" value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} />
        <input required type="password" minLength={8} placeholder="Password (8+)" value={u.password} onChange={(e) => setU({ ...u, password: e.target.value })} />
        <select value={u.role} onChange={(e) => setU({ ...u, role: e.target.value })}>
          {['customer', 'warehouse', 'inventory_manager', 'admin'].map((r) => <option key={r}>{r}</option>)}
        </select>
        {u.role === 'customer' && (
          <select required value={u.customer_id} onChange={(e) => setU({ ...u, customer_id: e.target.value })}>
            <option value="">Customer…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <button type="submit">Add user</button>
      </form>
      <table><thead><tr><th>Email</th><th>Role</th><th>Customer</th></tr></thead>
        <tbody>{users.map((x) => <tr key={x.id}><td>{x.email}</td><td>{x.role}</td><td>{cname_of(x.customer_id)}</td></tr>)}</tbody></table>
    </>
  );
}

function Audit() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api('/audit?limit=200').then(setRows).catch((e) => setError(e.message)); }, []);
  return (
    <>
      <Notice error={error} />
      <div className="scroll"><table>
        <thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Actor</th><th>Details</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}><td>{when(r.created_at)}</td><td>{r.action}</td><td>{r.entity} {r.entity_id?.slice(0, 8)}</td>
            <td>{r.actor_id?.slice(0, 8) ?? 'system'}</td><td className="muted">{JSON.stringify(r.details)}</td></tr>))}
        </tbody>
      </table></div>
    </>
  );
}

function Admin() {
  const [tab, setTab] = useState('products');
  return (
    <>
      <h1>Admin</h1>
      <div className="tabs">{TABS.map((t) => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t === 'audit' ? 'audit log' : t}</button>)}</div>
      {tab === 'products' && <Products />}
      {tab === 'people' && <People />}
      {tab === 'audit' && <Audit />}
    </>
  );
}
export default function AdminPage() { return <Shell roles={['admin']}><Admin /></Shell>; }
