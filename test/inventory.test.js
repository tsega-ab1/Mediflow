import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { pool } from '../src/db.js';
import { api, closeDb, days, makeProduct, makeUser, order, receive, resetDb } from './helpers.js';

describe('batch allocation rules', () => {
  let admin, manager, customer, product;
  beforeEach(async () => {
    await resetDb();
    admin = await makeUser('admin'); manager = await makeUser('inventory_manager'); customer = await makeUser('customer');
    product = await makeProduct(admin);
  });
  afterAll(closeDb);

  const batchOf = async (id) => (await pool.query('SELECT * FROM inventory.batches WHERE id=$1', [id])).rows[0];

  it('takes stock from the earliest-expiring eligible batch first', async () => {
    const late = await receive(manager, product.id, 'LATE', 10, days(400));
    const early = await receive(manager, product.id, 'EARLY', 10, days(200));
    expect((await order(customer, [{ product_id: product.id, quantity: 4 }])).status).toBe(201);
    expect((await batchOf(early.id)).reserved).toBe(4);
    expect((await batchOf(late.id)).reserved).toBe(0);
  });

  it('spills over to the next batch when the first is not enough', async () => {
    const early = await receive(manager, product.id, 'EARLY', 3, days(200));
    const late = await receive(manager, product.id, 'LATE', 10, days(400));
    const res = await order(customer, [{ product_id: product.id, quantity: 5 }]);
    expect(res.status).toBe(201);
    expect((await batchOf(early.id)).reserved).toBe(3);
    expect((await batchOf(late.id)).reserved).toBe(2);
  });

  it('never allocates recalled, quarantined, near-expiry or expired batches', async () => {
    const recalled = await receive(manager, product.id, 'RECALLED', 10, days(120));
    const quarantined = await receive(manager, product.id, 'QUAR', 10, days(130));
    const near = await receive(manager, product.id, 'NEAR', 10, days(30));
    await api().patch(`/inventory/batches/${recalled.id}/status`).set(manager.auth).send({ status: 'recalled' });
    await api().patch(`/inventory/batches/${quarantined.id}/status`).set(manager.auth).send({ status: 'quarantined' });
    const res = await order(customer, [{ product_id: product.id, quantity: 1 }]);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Insufficient stock/);
    const good = await receive(manager, product.id, 'GOOD', 5, days(300));
    expect((await order(customer, [{ product_id: product.id, quantity: 5 }])).status).toBe(201);
    expect((await batchOf(good.id)).reserved).toBe(5);
    expect((await batchOf(near.id)).reserved).toBe(0);
  });

  it('rejects ordering more than the available stock and changes nothing', async () => {
    const b = await receive(manager, product.id, 'B1', 5);
    const res = await order(customer, [{ product_id: product.id, quantity: 6 }]);
    expect(res.status).toBe(409);
    expect((await batchOf(b.id)).reserved).toBe(0);
    expect((await pool.query('SELECT count(*)::int AS n FROM orders.orders')).rows[0].n).toBe(0);
  });

  it('is all-or-nothing across items in one order', async () => {
    const other = await makeProduct(admin, 'PCM-100');
    const b1 = await receive(manager, product.id, 'B1', 5);
    await receive(manager, other.id, 'B2', 1);
    const res = await order(customer, [{ product_id: product.id, quantity: 2 }, { product_id: other.id, quantity: 9 }]);
    expect(res.status).toBe(409);
    expect((await batchOf(b1.id)).reserved).toBe(0);
  });

  it('validates batch input and rejects duplicate batch numbers', async () => {
    const bad = await api().post('/inventory/batches').set(manager.auth)
      .send({ product_id: product.id, batch_number: 'X', quantity: 0, expiry_date: days(-5) });
    expect(bad.status).toBe(400);
    await receive(manager, product.id, 'DUP', 1);
    const dup = await api().post('/inventory/batches').set(manager.auth)
      .send({ product_id: product.id, batch_number: 'DUP', quantity: 1, expiry_date: days(300) });
    expect(dup.status).toBe(409);
    expect((await api().post('/inventory/batches').set(customer.auth).send({})).status).toBe(403);
  });

  it('a recalled batch cannot be reactivated', async () => {
    const b = await receive(manager, product.id, 'R1', 5);
    await api().patch(`/inventory/batches/${b.id}/status`).set(manager.auth).send({ status: 'recalled' });
    const res = await api().patch(`/inventory/batches/${b.id}/status`).set(manager.auth).send({ status: 'active' });
    expect(res.status).toBe(409);
  });
});
