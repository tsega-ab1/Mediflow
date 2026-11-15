import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { settled } from '../src/events.js';
import { createCustomer, createUser, login } from '../src/modules/identity/index.js';

export const app = createApp();
export const api = () => request(app);
export const days = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

export async function resetDb() {
  await settled();
  await pool.query(`TRUNCATE notifications.notifications, billing.invoice_lines, billing.invoices, audit.audit_log, orders.order_status_history, orders.order_items, orders.orders,
    inventory.stock_movements, inventory.reservations, inventory.batches, catalog.products,
    identity.users, identity.customers RESTART IDENTITY CASCADE`);
  await pool.query('ALTER SEQUENCE billing.invoice_number_seq RESTART');
}

let n = 0;
export async function makeUser(role, customerName) {
  const id = ++n; // captured up front: makeUser is called in parallel
  let customer = null;
  if (role === 'customer') customer = await createCustomer(null, { name: customerName ?? `Pharmacy ${id}` });
  const email = `${role}${id}@test.local`;
  await createUser(null, { email, password: 'password123', role, customer_id: customer?.id });
  const { token, user } = await login({ email, password: 'password123' });
  return { token, user, customer, auth: { Authorization: `Bearer ${token}` } };
}

export async function makeProduct(admin, sku = 'AMX-500') {
  const res = await api().post('/catalog/products').set(admin.auth)
    .send({ name: 'Amoxicillin', sku, strength: '500mg', unit: 'capsule', price_cents: 250 });
  return res.body;
}

export async function receive(manager, product_id, batch_number, quantity, expiry_date = days(365)) {
  const res = await api().post('/inventory/batches').set(manager.auth).send({ product_id, batch_number, quantity, expiry_date });
  return res.body;
}

export const order = (user, items) => api().post('/orders').set(user.auth).send({ items });
export const closeDb = async () => { await settled(); await pool.end(); };
export { settled };

// Place an order and walk it to a given status as warehouse staff.
export async function shipOrder(customer, warehouse, items) {
  const placed = (await order(customer, items)).body;
  for (const status of ['packed', 'shipped'])
    await api().post(`/orders/${placed.id}/status`).set(warehouse.auth).send({ status });
  await settled();
  return placed;
}
