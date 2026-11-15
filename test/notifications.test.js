import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { api, closeDb, makeProduct, makeUser, order, receive, resetDb, settled, shipOrder } from './helpers.js';

describe('notifications', () => {
  let admin, manager, warehouse, alice, bob, product, batch;
  beforeEach(async () => {
    await resetDb();
    admin = await makeUser('admin'); manager = await makeUser('inventory_manager'); warehouse = await makeUser('warehouse');
    alice = await makeUser('customer'); bob = await makeUser('customer');
    product = await makeProduct(admin);
    batch = await receive(manager, product.id, 'B1', 50);
  });
  afterAll(closeDb);

  const inbox = async (u, q = '') => (await api().get(`/notifications${q}`).set(u.auth)).body;

  it('a new order notifies warehouse and admin, not other customers', async () => {
    await order(alice, [{ product_id: product.id, quantity: 2 }]);
    await settled();
    expect((await inbox(warehouse)).map((n) => n.type)).toContain('order.placed');
    expect((await inbox(admin)).map((n) => n.type)).toContain('order.placed');
    expect((await inbox(bob)).filter((n) => n.type === 'order.placed')).toHaveLength(0);
    expect((await inbox(manager))).toHaveLength(0);
  });

  it('status changes and invoices notify only the owning customer', async () => {
    await shipOrder(alice, warehouse, [{ product_id: product.id, quantity: 2 }]);
    const types = (await inbox(alice)).map((n) => n.type);
    expect(types).toEqual(expect.arrayContaining(['order.shipped', 'order.packed', 'invoice.issued']));
    expect(await inbox(bob)).toEqual([]);
  });

  it('a recall notifies stock staff and mentions affected orders', async () => {
    await order(alice, [{ product_id: product.id, quantity: 2 }]);
    await api().patch(`/inventory/batches/${batch.id}/status`).set(manager.auth).send({ status: 'recalled' });
    await settled();
    const n = (await inbox(manager)).find((x) => x.type === 'batch.recalled');
    expect(n.title).toMatch(/B1/);
    expect(n.body).toMatch(/1 open order/);
    expect((await inbox(alice)).find((x) => x.type === 'batch.recalled')).toBeUndefined();
  });

  it('counts unread, marks read, and keeps inboxes private', async () => {
    await shipOrder(alice, warehouse, [{ product_id: product.id, quantity: 1 }]);
    const count = async (u) => (await api().get('/notifications/unread-count').set(u.auth)).body.count;
    const before = await count(alice);
    expect(before).toBeGreaterThan(0);
    const [first] = await inbox(alice);
    expect((await api().post(`/notifications/${first.id}/read`).set(bob.auth)).status).toBe(404);
    expect((await api().post(`/notifications/${first.id}/read`).set(alice.auth)).body.read_at).toBeTruthy();
    expect(await count(alice)).toBe(before - 1);
    expect((await inbox(alice, '?unread=true')).length).toBe(before - 1);
    await api().post('/notifications/read-all').set(alice.auth);
    expect(await count(alice)).toBe(0);
    expect((await api().get('/notifications')).status).toBe(401);
  });
});
