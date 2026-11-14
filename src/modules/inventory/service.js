import { pool, query, withTransaction } from '../../db.js';
import { config } from '../../config.js';
import { events } from '../../events.js';
import { AppError, badRequest, conflict, notFound } from '../../errors.js';
import { record } from '../audit/index.js';
import { getProduct } from '../catalog/index.js';

export const BATCH_STATUSES = ['active', 'quarantined', 'recalled'];

export class InsufficientStockError extends AppError {
  constructor(productId, requested, available) {
    super(409, `Insufficient stock: requested ${requested}, available ${available}`);
    this.productId = productId;
    this.requested = requested;
    this.available = available;
  }
}

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export async function receiveBatch(actor, b = {}) {
  const errors = [];
  if (!b.product_id) errors.push('product_id is required');
  if (typeof b.batch_number !== 'string' || !b.batch_number.trim()) errors.push('batch_number is required');
  if (!isDate(b.expiry_date)) errors.push('expiry_date must be YYYY-MM-DD');
  else if (b.expiry_date <= new Date().toISOString().slice(0, 10)) errors.push('expiry_date must be in the future');
  if (!Number.isInteger(b.quantity) || b.quantity <= 0) errors.push('quantity must be a positive integer');
  if (errors.length) throw badRequest(errors.join('; '));
  if (!(await getProduct(b.product_id))) throw notFound('Product not found');

  try {
    return await withTransaction(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO inventory.batches (product_id, batch_number, expiry_date, on_hand)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [b.product_id, b.batch_number.trim(), b.expiry_date, b.quantity]
      );
      await c.query(
        `INSERT INTO inventory.stock_movements (batch_id, quantity_delta, reserved_delta, reason, actor_id)
         VALUES ($1,$2,0,'receive',$3)`,
        [rows[0].id, b.quantity, actor?.id ?? null]
      );
      await record(c, { actorId: actor?.id, action: 'batch.received', entity: 'batch', entityId: rows[0].id,
        details: { product_id: b.product_id, batch_number: rows[0].batch_number, quantity: b.quantity } });
      return rows[0];
    });
  } catch (e) {
    if (e.code === '23505') throw conflict('Batch number already exists for this product');
    throw e;
  }
}

export async function listBatches({ product_id } = {}) {
  const { rows } = await query(
    `SELECT *, (on_hand - reserved) AS available FROM inventory.batches
     WHERE ($1::uuid IS NULL OR product_id = $1) ORDER BY expiry_date, id`,
    [product_id ?? null]
  );
  return rows;
}

// Recalled is final. Quarantined batches can be released back to active.
export async function setBatchStatus(actor, id, status) {
  if (!BATCH_STATUSES.includes(status)) throw badRequest(`status must be one of: ${BATCH_STATUSES.join(', ')}`);
  const result = await withTransaction(async (c) => {
    const { rows: [batch] } = await c.query('SELECT * FROM inventory.batches WHERE id = $1 FOR UPDATE', [id]);
    if (!batch) throw notFound('Batch not found');
    if (batch.status === status) return { batch, affectedOrderIds: [], from: status };
    if (batch.status === 'recalled') throw conflict('A recalled batch cannot be changed');
    const { rows: [updated] } = await c.query('UPDATE inventory.batches SET status = $2 WHERE id = $1 RETURNING *', [id, status]);
    const { rows } = await c.query(
      `SELECT DISTINCT order_id FROM inventory.reservations
       WHERE batch_id = $1 AND released_at IS NULL AND shipped_at IS NULL`, [id]);
    await record(c, { actorId: actor?.id, action: 'batch.status_changed', entity: 'batch', entityId: id,
      details: { from: batch.status, to: status, affected_orders: rows.length } });
    return { batch: updated, affectedOrderIds: status === 'active' ? [] : rows.map((r) => r.order_id), from: batch.status };
  });
  if (status === 'recalled' && result.from !== 'recalled') {
    events.emit('BatchRecalled', { batchId: id, affectedOrderIds: result.affectedOrderIds });
  }
  return { ...result.batch, affected_order_ids: result.affectedOrderIds };
}

// ---- Interface used by the orders module (always inside the caller's transaction) ----

// Reserves stock from the earliest-expiring eligible batches. Eligible = active, not near
// expiry, and with unreserved stock. Locking the product's eligible batch rows serialises
// concurrent orders so stock can never go below zero.
export async function reserveStock(c, { orderId, orderItemId, productId, quantity, actorId }) {
  const { rows: batches } = await c.query(
    `SELECT id, on_hand, reserved FROM inventory.batches
     WHERE product_id = $1 AND status = 'active'
       AND expiry_date > CURRENT_DATE + $2::int AND on_hand > reserved
     ORDER BY expiry_date, id FOR UPDATE`,
    [productId, config.nearExpiryDays]
  );
  const available = batches.reduce((s, b) => s + (b.on_hand - b.reserved), 0);
  if (available < quantity) throw new InsufficientStockError(productId, quantity, available);

  let remaining = quantity;
  for (const b of batches) {
    if (remaining === 0) break;
    const take = Math.min(remaining, b.on_hand - b.reserved);
    await c.query('UPDATE inventory.batches SET reserved = reserved + $2 WHERE id = $1', [b.id, take]);
    await c.query(
      `INSERT INTO inventory.reservations (order_id, order_item_id, batch_id, quantity) VALUES ($1,$2,$3,$4)`,
      [orderId, orderItemId, b.id, take]);
    await c.query(
      `INSERT INTO inventory.stock_movements (batch_id, quantity_delta, reserved_delta, reason, order_id, actor_id)
       VALUES ($1,0,$2,'reserve',$3,$4)`, [b.id, take, orderId, actorId ?? null]);
    remaining -= take;
  }
}

export async function releaseReservations(c, { orderId, actorId }) {
  const { rows } = await c.query(
    `SELECT id, batch_id, quantity FROM inventory.reservations
     WHERE order_id = $1 AND released_at IS NULL AND shipped_at IS NULL
     ORDER BY batch_id FOR UPDATE`, [orderId]);
  for (const r of rows) {
    await c.query('UPDATE inventory.batches SET reserved = reserved - $2 WHERE id = $1', [r.batch_id, r.quantity]);
    await c.query('UPDATE inventory.reservations SET released_at = now() WHERE id = $1', [r.id]);
    await c.query(
      `INSERT INTO inventory.stock_movements (batch_id, quantity_delta, reserved_delta, reason, order_id, actor_id)
       VALUES ($1,0,$2,'release',$3,$4)`, [r.batch_id, -r.quantity, orderId, actorId ?? null]);
  }
}

// Ships reserved stock: stock leaves the warehouse. Refuses if any batch was recalled or quarantined.
export async function shipReservations(c, { orderId, actorId }) {
  const { rows } = await c.query(
    `SELECT r.id, r.batch_id, r.quantity, b.status, b.batch_number
     FROM inventory.reservations r JOIN inventory.batches b ON b.id = r.batch_id
     WHERE r.order_id = $1 AND r.released_at IS NULL AND r.shipped_at IS NULL
     ORDER BY b.id FOR UPDATE OF b, r`, [orderId]);
  const blocked = rows.filter((r) => r.status !== 'active');
  if (blocked.length) {
    throw conflict(`Cannot ship: batch ${[...new Set(blocked.map((r) => r.batch_number))].join(', ')} is ${blocked[0].status}. Cancel the order or contact the inventory manager.`);
  }
  for (const r of rows) {
    await c.query('UPDATE inventory.batches SET on_hand = on_hand - $2, reserved = reserved - $2 WHERE id = $1', [r.batch_id, r.quantity]);
    await c.query('UPDATE inventory.reservations SET shipped_at = now() WHERE id = $1', [r.id]);
    await c.query(
      `INSERT INTO inventory.stock_movements (batch_id, quantity_delta, reserved_delta, reason, order_id, actor_id)
       VALUES ($1,$2,$2,'ship',$3,$4)`, [r.batch_id, -r.quantity, orderId, actorId ?? null]);
  }
}

// Traceability: which batches an order was allocated from.
export async function batchesForOrder(orderId) {
  const { rows } = await pool.query(
    `SELECT r.order_item_id, r.quantity, r.released_at, r.shipped_at,
            b.id AS batch_id, b.batch_number, b.expiry_date, b.status AS batch_status
     FROM inventory.reservations r JOIN inventory.batches b ON b.id = r.batch_id
     WHERE r.order_id = $1 ORDER BY b.expiry_date, b.id`, [orderId]);
  return rows;
}
