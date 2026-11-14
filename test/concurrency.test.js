import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { pool } from '../src/db.js';
import { closeDb, makeProduct, makeUser, order, receive, resetDb } from './helpers.js';

describe('no overselling under concurrency', () => {
  let admin, manager, product, batch, customers;
  beforeEach(async () => {
    await resetDb();
    admin = await makeUser('admin'); manager = await makeUser('inventory_manager');
    customers = await Promise.all(Array.from({ length: 10 }, () => makeUser('customer')));
    product = await makeProduct(admin);
  });
  afterAll(closeDb);

  it('ten simultaneous orders for the last 5 units sell exactly 5', async () => {
    batch = await receive(manager, product.id, 'LAST5', 5);
    const results = await Promise.all(customers.map((c) => order(c, [{ product_id: product.id, quantity: 1 }])));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    const { rows: [b] } = await pool.query('SELECT on_hand, reserved FROM inventory.batches WHERE id=$1', [batch.id]);
    expect(b).toEqual({ on_hand: 5, reserved: 5 });
    const { rows: [sum] } = await pool.query('SELECT sum(quantity)::int AS q FROM inventory.reservations');
    expect(sum.q).toBe(5);
  });

  it('stays correct across several batches and multi-unit orders', async () => {
    await receive(manager, product.id, 'A', 7, new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10));
    await receive(manager, product.id, 'B', 8, new Date(Date.now() + 300 * 864e5).toISOString().slice(0, 10));
    const results = await Promise.all(customers.map((c) => order(c, [{ product_id: product.id, quantity: 3 }])));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5); // 15 units / 3
    const { rows } = await pool.query('SELECT batch_number, on_hand, reserved FROM inventory.batches ORDER BY batch_number');
    expect(rows.reduce((s, r) => s + r.reserved, 0)).toBe(15);
    expect(rows.every((r) => r.reserved <= r.on_hand)).toBe(true);
  });

  it('simultaneous cancel and ship of the same order cannot corrupt stock', async () => {
    batch = await receive(manager, product.id, 'RACE', 10);
    const wh = await makeUser('warehouse');
    const o = (await order(customers[0], [{ product_id: product.id, quantity: 4 }])).body;
    const { api } = await import('./helpers.js');
    await api().post(`/orders/${o.id}/status`).set(wh.auth).send({ status: 'packed' });
    await Promise.all([
      api().post(`/orders/${o.id}/status`).set(wh.auth).send({ status: 'shipped' }),
      api().post(`/orders/${o.id}/cancel`).set(wh.auth),
    ]);
    const { rows: [b] } = await pool.query('SELECT on_hand, reserved FROM inventory.batches WHERE id=$1', [batch.id]);
    expect(b.reserved).toBe(0);
    expect([6, 10]).toContain(b.on_hand); // shipped (6) or cancelled (10), never both
  });
});
