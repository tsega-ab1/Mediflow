import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { pool } from '../src/db.js';
import { api, closeDb, makeProduct, makeUser, order, receive, resetDb } from './helpers.js';

describe('order lifecycle', () => {
  let admin, manager, warehouse, alice, bob, product, batch;
  beforeEach(async () => {
    await resetDb();
    admin = await makeUser('admin'); manager = await makeUser('inventory_manager'); warehouse = await makeUser('warehouse');
    alice = await makeUser('customer', 'Alice Pharmacy'); bob = await makeUser('customer', 'Bob Clinic');
    product = await makeProduct(admin);
    batch = await receive(manager, product.id, 'B1', 20);
  });
  afterAll(closeDb);

  const place = async (u = alice, qty = 5) => (await order(u, [{ product_id: product.id, quantity: qty }])).body;
  const move = (id, status, u = warehouse) => api().post(`/orders/${id}/status`).set(u.auth).send({ status });
  const stock = async () => (await pool.query('SELECT on_hand, reserved FROM inventory.batches WHERE id=$1', [batch.id])).rows[0];

  it('runs the full flow and records history, batches and audit', async () => {
    const o = await place();
    expect(o.status).toBe('confirmed');
    expect(await stock()).toEqual({ on_hand: 20, reserved: 5 });
    for (const s of ['packed', 'shipped', 'delivered']) expect((await move(o.id, s)).body.status).toBe(s);
    expect(await stock()).toEqual({ on_hand: 15, reserved: 0 });

    const detail = (await api().get(`/orders/${o.id}`).set(warehouse.auth)).body;
    expect(detail.history.map((h) => h.to_status)).toEqual(['placed', 'confirmed', 'packed', 'shipped', 'delivered']);
    expect(detail.history.every((h) => h.actor_id && h.created_at)).toBe(true);
    expect(detail.batches[0]).toMatchObject({ batch_number: 'B1', quantity: 5 });
    expect(detail.customer_name).toBe('Alice Pharmacy');

    const audit = (await api().get(`/audit?entity=order&entity_id=${o.id}`).set(admin.auth)).body;
    expect(audit.map((a) => a.action)).toContain('order.shipped');
    const moves = (await pool.query('SELECT reason, actor_id FROM inventory.stock_movements WHERE order_id=$1', [o.id])).rows;
    expect(moves.map((m) => m.reason)).toEqual(['reserve', 'ship']);
    expect(moves.every((m) => m.actor_id)).toBe(true);
  });

  it('rejects invalid status changes', async () => {
    const o = await place();
    expect((await move(o.id, 'shipped')).status).toBe(409);
    expect((await move(o.id, 'delivered')).status).toBe(409);
    expect((await move(o.id, 'cancelled')).status).toBe(400);
    expect((await move(o.id, 'packed', alice)).status).toBe(403);
    await move(o.id, 'packed');
    expect((await move(o.id, 'packed')).status).toBe(409);
  });

  it("a customer cannot see or touch another customer's order", async () => {
    const o = await place(alice);
    expect((await api().get(`/orders/${o.id}`).set(bob.auth)).status).toBe(404);
    expect((await api().post(`/orders/${o.id}/cancel`).set(bob.auth)).status).toBe(404);
    expect((await api().get('/orders').set(bob.auth)).body).toEqual([]);
    expect((await api().get('/orders').set(alice.auth)).body).toHaveLength(1);
    expect((await api().get('/orders').set(warehouse.auth)).body).toHaveLength(1);
    expect((await api().get(`/orders/${o.id}`).set(alice.auth)).body.batches).toBeUndefined();
  });

  it('customer cancels before packing and stock is released', async () => {
    const o = await place();
    const res = await api().post(`/orders/${o.id}/cancel`).set(alice.auth);
    expect(res.body.status).toBe('cancelled');
    expect(await stock()).toEqual({ on_hand: 20, reserved: 0 });
    expect((await api().post(`/orders/${o.id}/cancel`).set(alice.auth)).status).toBe(409);
  });

  it('customer cannot cancel once packed; staff can until shipped', async () => {
    const o = await place();
    await move(o.id, 'packed');
    expect((await api().post(`/orders/${o.id}/cancel`).set(alice.auth)).status).toBe(409);
    expect((await api().post(`/orders/${o.id}/cancel`).set(warehouse.auth)).body.status).toBe('cancelled');
    expect(await stock()).toEqual({ on_hand: 20, reserved: 0 });
    const o2 = await place();
    await move(o2.id, 'packed'); await move(o2.id, 'shipped');
    expect((await api().post(`/orders/${o2.id}/cancel`).set(warehouse.auth)).status).toBe(409);
  });

  it('a recalled batch blocks shipping and is reported to the manager', async () => {
    const o = await place();
    const res = await api().patch(`/inventory/batches/${batch.id}/status`).set(manager.auth).send({ status: 'recalled' });
    expect(res.body.affected_order_ids).toEqual([o.id]);
    await move(o.id, 'packed');
    const ship = await move(o.id, 'shipped');
    expect(ship.status).toBe(409);
    expect(ship.body.error).toMatch(/recalled/);
    expect((await api().post(`/orders/${o.id}/cancel`).set(warehouse.auth)).body.status).toBe('cancelled');
  });

  it('validates order input', async () => {
    expect((await order(alice, [])).status).toBe(400);
    expect((await order(alice, [{ product_id: product.id, quantity: 0 }])).status).toBe(400);
    expect((await order(alice, [{ product_id: 'nope', quantity: 1 }])).status).toBe(400);
    expect((await order(alice, [{ product_id: '00000000-0000-0000-0000-000000000000', quantity: 1 }])).status).toBe(404);
    expect((await order(warehouse, [{ product_id: product.id, quantity: 1 }])).status).toBe(403);
  });

  it('audit log is append-only', async () => {
    await place();
    await expect(pool.query('DELETE FROM audit.audit_log')).rejects.toThrow(/append-only/);
    await expect(pool.query("UPDATE audit.audit_log SET action='x'")).rejects.toThrow(/append-only/);
  });
});
