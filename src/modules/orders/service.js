import { pool, query, withTransaction } from '../../db.js';
import { events } from '../../events.js';
import { AppError, badRequest, conflict, notFound } from '../../errors.js';
import { record } from '../audit/index.js';
import { getActiveProducts, getProducts } from '../catalog/index.js';
import { getCustomers } from '../identity/index.js';
import { InsufficientStockError, batchesForOrder, releaseReservations, reserveStock, shipReservations } from '../inventory/index.js';
import { STATUSES, canAdvance, canCancel } from './transitions.js';

const isStaff = (role) => role === 'warehouse' || role === 'admin';

function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length) throw badRequest('items must be a non-empty array');
  const merged = new Map();
  for (const it of items) {
    if (!it || typeof it.product_id !== 'string') throw badRequest('each item needs a product_id');
    if (!Number.isInteger(it.quantity) || it.quantity <= 0 || it.quantity > 100000)
      throw badRequest('quantity must be a positive integer');
    const id = it.product_id.toLowerCase();
    merged.set(id, (merged.get(id) ?? 0) + it.quantity);
  }
  // Fixed order (by product) so concurrent orders lock stock in the same order: no deadlocks.
  return [...merged].map(([product_id, quantity]) => ({ product_id, quantity }))
    .sort((a, b) => (a.product_id < b.product_id ? -1 : 1));
}

async function addEvent(c, orderId, from, to, actorId) {
  await c.query(
    `INSERT INTO orders.order_status_history (order_id, from_status, to_status, actor_id) VALUES ($1,$2,$3,$4)`,
    [orderId, from, to, actorId ?? null]);
}

export async function createOrder(user, rawItems) {
  if (user.role !== 'customer' || !user.customerId) throw new AppError(403, 'Only customer accounts can place orders');
  const items = normalizeItems(rawItems);
  const products = await getActiveProducts(items.map((i) => i.product_id));
  const byId = new Map(products.map((p) => [p.id, p]));
  const missing = items.filter((i) => !byId.has(i.product_id));
  if (missing.length) throw notFound('Unknown or inactive product');

  let orderId;
  try {
    orderId = await withTransaction(async (c) => {
      const { rows: [order] } = await c.query(
        `INSERT INTO orders.orders (customer_id) VALUES ($1) RETURNING id`, [user.customerId]);
      await addEvent(c, order.id, null, 'placed', user.id);
      for (const it of items) {
        const { rows: [row] } = await c.query(
          `INSERT INTO orders.order_items (order_id, product_id, quantity, unit_price_cents) VALUES ($1,$2,$3,$4) RETURNING id`,
          [order.id, it.product_id, it.quantity, byId.get(it.product_id).price_cents]);
        await reserveStock(c, { orderId: order.id, orderItemId: row.id, productId: it.product_id, quantity: it.quantity, actorId: user.id });
      }
      await c.query(`UPDATE orders.orders SET status = 'confirmed', updated_at = now() WHERE id = $1`, [order.id]);
      await addEvent(c, order.id, 'placed', 'confirmed', user.id);
      await record(c, { actorId: user.id, action: 'order.placed', entity: 'order', entityId: order.id, details: { items } });
      return order.id;
    });
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      const p = byId.get(e.productId);
      throw conflict(`Insufficient stock for ${p?.name ?? 'product'} (${p?.sku ?? e.productId}): requested ${e.requested}, available ${e.available}`);
    }
    throw e;
  }
  events.emit('OrderPlaced', { orderId, customerId: user.customerId });
  return getOrder(user, orderId);
}

async function hydrate(user, orders) {
  if (!orders.length) return [];
  const { rows: items } = await query(
    'SELECT order_id, product_id, quantity, unit_price_cents FROM orders.order_items WHERE order_id = ANY($1) ORDER BY order_id, product_id',
    [orders.map((o) => o.id)]);
  const products = new Map((await getProducts([...new Set(items.map((i) => i.product_id))])).map((p) => [p.id, p]));
  const customers = isStaff(user.role)
    ? new Map((await getCustomers([...new Set(orders.map((o) => o.customer_id))])).map((c) => [c.id, c.name]))
    : new Map();
  return orders.map((o) => {
    const own = items.filter((i) => i.order_id === o.id).map((i) => ({
      product_id: i.product_id, quantity: i.quantity, unit_price_cents: i.unit_price_cents,
      name: products.get(i.product_id)?.name, sku: products.get(i.product_id)?.sku,
    }));
    return {
      ...o,
      ...(isStaff(user.role) ? { customer_name: customers.get(o.customer_id) ?? null } : {}),
      items: own,
      total_cents: own.reduce((s, i) => s + i.quantity * i.unit_price_cents, 0),
    };
  });
}

// Customers only ever see their own orders; anything else looks like "not found".
function visible(user, order) {
  return order && (user.role !== 'customer' || order.customer_id === user.customerId);
}

export async function listOrders(user, { status } = {}) {
  if (status && !STATUSES.includes(status)) throw badRequest('invalid status filter');
  const { rows } = await query(
    `SELECT * FROM orders.orders
     WHERE ($1::uuid IS NULL OR customer_id = $1) AND ($2::text IS NULL OR status = $2)
     ORDER BY created_at DESC LIMIT 100`,
    [user.role === 'customer' ? user.customerId : null, status ?? null]);
  return hydrate(user, rows);
}

export async function getOrder(user, id) {
  const { rows: [order] } = await query('SELECT * FROM orders.orders WHERE id = $1', [id]);
  if (!visible(user, order)) throw notFound('Order not found');
  const [detail] = await hydrate(user, [order]);
  const { rows: history } = await query(
    'SELECT from_status, to_status, actor_id, created_at FROM orders.order_status_history WHERE order_id = $1 ORDER BY id', [id]);
  return { ...detail, history, ...(isStaff(user.role) ? { batches: await batchesForOrder(id) } : {}) };
}

async function lockOrder(c, user, id) {
  const { rows: [order] } = await c.query('SELECT * FROM orders.orders WHERE id = $1 FOR UPDATE', [id]);
  if (!visible(user, order)) throw notFound('Order not found');
  return order;
}

export async function advanceOrder(user, id, to) {
  if (!STATUSES.includes(to) || to === 'cancelled') throw badRequest('status must be packed, shipped or delivered');
  let customerId;
  await withTransaction(async (c) => {
    const order = await lockOrder(c, user, id);
    customerId = order.customer_id;
    if (!canAdvance(order.status, to)) throw conflict(`Invalid status change: ${order.status} -> ${to}`);
    if (to === 'shipped') await shipReservations(c, { orderId: id, actorId: user.id });
    await c.query('UPDATE orders.orders SET status = $2, updated_at = now() WHERE id = $1', [id, to]);
    await addEvent(c, id, order.status, to, user.id);
    await record(c, { actorId: user.id, action: `order.${to}`, entity: 'order', entityId: id, details: { from: order.status } });
  });
  events.emit('OrderStatusChanged', { orderId: id, customerId, status: to });
  return getOrder(user, id);
}

export async function cancelOrder(user, id) {
  let customerId;
  await withTransaction(async (c) => {
    const order = await lockOrder(c, user, id);
    customerId = order.customer_id;
    if (!canCancel(user.role, order.status)) throw conflict(`An order that is ${order.status} cannot be cancelled by you`);
    await releaseReservations(c, { orderId: id, actorId: user.id });
    await c.query(`UPDATE orders.orders SET status = 'cancelled', updated_at = now() WHERE id = $1`, [id]);
    await addEvent(c, id, order.status, 'cancelled', user.id);
    await record(c, { actorId: user.id, action: 'order.cancelled', entity: 'order', entityId: id, details: { from: order.status } });
  });
  events.emit('OrderStatusChanged', { orderId: id, customerId, status: 'cancelled' });
  return getOrder(user, id);
}

// ---- Interfaces for the billing and reporting modules ----

export async function getOrderForBilling(orderId) {
  const { rows: [order] } = await query('SELECT id, customer_id, status FROM orders.orders WHERE id = $1', [orderId]);
  if (!order) return null;
  const { rows: items } = await query(
    'SELECT product_id, quantity, unit_price_cents FROM orders.order_items WHERE order_id = $1 ORDER BY product_id', [orderId]);
  const products = new Map((await getProducts(items.map((i) => i.product_id))).map((p) => [p.id, p]));
  return {
    ...order,
    items: items.map((i) => ({ ...i, name: products.get(i.product_id)?.name ?? 'Product', sku: products.get(i.product_id)?.sku })),
  };
}

export async function orderStats() {
  const { rows } = await query('SELECT status, count(*)::int AS n FROM orders.orders GROUP BY status');
  const { rows: [recent] } = await query(
    `SELECT count(*)::int AS n FROM orders.orders WHERE created_at > now() - interval '30 days'`);
  return { by_status: Object.fromEntries(rows.map((r) => [r.status, r.n])), placed_last_30_days: recent.n };
}

export async function topProducts({ days = 30, limit = 5 } = {}) {
  const { rows } = await query(
    `SELECT i.product_id, sum(i.quantity)::int AS quantity
     FROM orders.order_items i JOIN orders.orders o ON o.id = i.order_id
     WHERE o.status <> 'cancelled' AND o.created_at > now() - ($1::int * interval '1 day')
     GROUP BY i.product_id ORDER BY quantity DESC, i.product_id LIMIT $2`, [days, limit]);
  return rows;
}
