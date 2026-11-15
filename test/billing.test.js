import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { pool } from '../src/db.js';
import { api, closeDb, makeProduct, makeUser, order, receive, resetDb, settled, shipOrder } from './helpers.js';

describe('invoicing', () => {
  let admin, manager, warehouse, alice, bob, product;
  beforeEach(async () => {
    await resetDb();
    admin = await makeUser('admin'); manager = await makeUser('inventory_manager'); warehouse = await makeUser('warehouse');
    alice = await makeUser('customer', 'Alice Pharmacy'); bob = await makeUser('customer', 'Bob Clinic');
    product = await makeProduct(admin); // price 250
    await receive(manager, product.id, 'B1', 100);
  });
  afterAll(closeDb);

  const items = (qty) => [{ product_id: product.id, quantity: qty }];
  const invoices = async (u) => (await api().get('/billing/invoices').set(u.auth)).body;

  it('locks the price when the order is placed and shows the order total', async () => {
    const o = (await order(alice, items(4))).body;
    expect(o.items[0].unit_price_cents).toBe(250);
    expect(o.total_cents).toBe(1000);
    await api().patch(`/catalog/products/${product.id}`).set(admin.auth).send({ price_cents: 999 });
    expect((await api().get(`/orders/${o.id}`).set(alice.auth)).body.total_cents).toBe(1000);
  });

  it('issues one invoice automatically when the order ships, using the locked price', async () => {
    const o = (await order(alice, items(4))).body;
    await api().patch(`/catalog/products/${product.id}`).set(admin.auth).send({ price_cents: 999 });
    expect(await invoices(alice)).toHaveLength(0);
    await api().post(`/orders/${o.id}/status`).set(warehouse.auth).send({ status: 'packed' });
    await settled();
    expect(await invoices(alice)).toHaveLength(0); // not before shipping
    await api().post(`/orders/${o.id}/status`).set(warehouse.auth).send({ status: 'shipped' });
    await settled();
    const [inv] = await invoices(alice);
    expect(inv).toMatchObject({ status: 'issued', total_cents: 1000, overdue: false });
    expect(inv.number).toMatch(/^INV-\d{4}-000001$/);
    const detail = (await api().get(`/billing/invoices/${inv.id}`).set(alice.auth)).body;
    expect(detail.lines).toHaveLength(1);
    expect(detail.lines[0]).toMatchObject({ unit_price_cents: 250, quantity: 4, line_total_cents: 1000 });
    expect(detail.customer_name).toBe('Alice Pharmacy');
    const due = new Date(detail.due_at) - new Date(detail.issued_at);
    expect(Math.round(due / 864e5)).toBe(30);
  });

  it('the safety-net endpoint never creates a second invoice', async () => {
    const o = await shipOrder(alice, warehouse, items(2));
    const again = await api().post(`/billing/orders/${o.id}/invoice`).set(admin.auth);
    expect(again.status).toBe(200);
    const parallel = await Promise.all([1, 2, 3].map(() => api().post(`/billing/orders/${o.id}/invoice`).set(admin.auth)));
    expect(parallel.every((r) => r.status === 200)).toBe(true);
    expect((await pool.query('SELECT count(*)::int AS n FROM billing.invoices')).rows[0].n).toBe(1);
    const placed = (await order(alice, items(1))).body; // not shipped yet
    expect((await api().post(`/billing/orders/${placed.id}/invoice`).set(admin.auth)).status).toBe(409);
  });

  it('customers see only their own invoices; others get 404', async () => {
    await shipOrder(alice, warehouse, items(1));
    const [inv] = await invoices(alice);
    expect(await invoices(bob)).toEqual([]);
    expect((await api().get(`/billing/invoices/${inv.id}`).set(bob.auth)).status).toBe(404);
    expect((await api().get('/billing/invoices').set(warehouse.auth)).status).toBe(403);
    const all = (await api().get('/billing/invoices').set(admin.auth)).body;
    expect(all[0].customer_name).toBe('Alice Pharmacy');
  });

  it('only an admin can record payment, once', async () => {
    await shipOrder(alice, warehouse, items(1));
    const [inv] = await invoices(alice);
    expect((await api().post(`/billing/invoices/${inv.id}/pay`).set(alice.auth).send({})).status).toBe(403);
    const paid = await api().post(`/billing/invoices/${inv.id}/pay`).set(admin.auth).send({ reference: 'BANK-123' });
    expect(paid.status).toBe(200);
    expect(paid.body).toMatchObject({ status: 'paid', payment_reference: 'BANK-123' });
    expect((await api().post(`/billing/invoices/${inv.id}/pay`).set(admin.auth).send({})).status).toBe(409);
    const audit = (await api().get(`/audit?entity=invoice&entity_id=${inv.id}`).set(admin.auth)).body;
    expect(audit.map((a) => a.action).sort()).toEqual(['invoice.issued', 'invoice.paid']);
  });

  it('flags unpaid invoices past their due date as overdue', async () => {
    await shipOrder(alice, warehouse, items(1));
    await pool.query("UPDATE billing.invoices SET due_at = now() - interval '2 days'");
    const [inv] = await invoices(alice);
    expect(inv.overdue).toBe(true);
    expect((await api().get('/billing/invoices?status=overdue').set(admin.auth)).body).toHaveLength(1);
    await api().post(`/billing/invoices/${inv.id}/pay`).set(admin.auth).send({});
    expect((await api().get('/billing/invoices?status=overdue').set(admin.auth)).body).toHaveLength(0);
    expect((await api().get('/billing/invoices?status=nope').set(admin.auth)).status).toBe(400);
  });
});
