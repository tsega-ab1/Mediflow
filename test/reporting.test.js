import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { api, closeDb, days, makeProduct, makeUser, order, receive, resetDb, shipOrder } from './helpers.js';

describe('reports', () => {
  let admin, manager, warehouse, alice, amx, pcm;
  beforeEach(async () => {
    await resetDb();
    admin = await makeUser('admin'); manager = await makeUser('inventory_manager'); warehouse = await makeUser('warehouse');
    alice = await makeUser('customer');
    amx = await makeProduct(admin, 'AMX-500');
    pcm = await makeProduct(admin, 'PCM-500');
    await receive(manager, amx.id, 'A1', 100, days(300));
    await receive(manager, pcm.id, 'P1', 10, days(60)); // inside the 90-day near-expiry window: not sellable
    await receive(manager, pcm.id, 'P2', 15, days(100));
  });
  afterAll(closeDb);

  const report = async (u, q = '') => api().get(`/reports/overview${q}`).set(u.auth);

  it('summarises orders, top products, low stock and expiring batches', async () => {
    await shipOrder(alice, warehouse, [{ product_id: amx.id, quantity: 30 }]);
    await order(alice, [{ product_id: pcm.id, quantity: 5 }]);
    const { body } = await report(admin, '?low_stock=20&expiring_days=120');
    expect(body.orders.by_status).toMatchObject({ shipped: 1, confirmed: 1 });
    expect(body.orders.placed_last_30_days).toBe(2);
    expect(body.top_products[0]).toMatchObject({ sku: 'AMX-500', quantity: 30 });
    const low = body.low_stock.find((s) => s.sku === 'PCM-500');
    expect(low).toMatchObject({ on_hand: 25, reserved: 5, sellable: 10 }); // P2 only: 15 - 5
    expect(body.low_stock.find((s) => s.sku === 'AMX-500')).toBeUndefined();
    expect(body.expiring_batches.map((b) => b.batch_number)).toEqual(['P1', 'P2']);
    expect(body.billing).toMatchObject({ outstanding: 30 * 250, overdue_count: 0 });
  });

  it('respects the thresholds in the query string', async () => {
    const { body } = await report(admin, '?low_stock=1000&expiring_days=70');
    expect(body.low_stock.map((s) => s.sku)).toEqual(expect.arrayContaining(['AMX-500', 'PCM-500']));
    expect(body.expiring_batches.map((b) => b.batch_number)).toEqual(['P1']);
  });

  it('keeps financial figures away from inventory managers and blocks other roles', async () => {
    const { body, status } = await report(manager);
    expect(status).toBe(200);
    expect(body.billing).toBeUndefined();
    expect((await report(warehouse)).status).toBe(403);
    expect((await report(alice)).status).toBe(403);
  });

  it('exports stock as CSV', async () => {
    const res = await api().get('/reports/stock.csv').set(manager.auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.trim().split('\n');
    expect(lines[0]).toBe('sku,name,on_hand,reserved,sellable');
    expect(lines).toContain('AMX-500,Amoxicillin,100,0,100');
    expect((await api().get('/reports/stock.csv').set(alice.auth)).status).toBe(403);
  });
});
