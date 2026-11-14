import { pool, query } from '../../db.js';
import { AppError, badRequest, conflict, notFound } from '../../errors.js';
import { record } from '../audit/index.js';

export class ValidationError extends AppError {
  constructor(message) { super(400, message); }
}

export function validateProduct(p = {}) {
  const errors = [];
  if (!p.name?.trim()) errors.push('name is required');
  if (!p.sku?.trim()) errors.push('sku is required');
  if (!p.unit?.trim()) errors.push('unit is required');
  if (!Number.isInteger(p.price_cents) || p.price_cents < 0)
    errors.push('price_cents must be a non-negative integer');
  if (errors.length) throw new ValidationError(errors.join('; '));
}

export async function createProduct(actor, p) {
  validateProduct(p);
  try {
    const { rows } = await query(
      `INSERT INTO catalog.products (name, sku, strength, unit, price_cents)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [p.name.trim(), p.sku.trim(), p.strength ?? null, p.unit.trim(), p.price_cents]
    );
    await record(pool, { actorId: actor?.id, action: 'product.created', entity: 'product', entityId: rows[0].id, details: { sku: rows[0].sku } });
    return rows[0];
  } catch (e) {
    if (e.code === '23505') throw conflict('SKU already exists');
    throw e;
  }
}

const EDITABLE = {
  name: (v) => typeof v === 'string' && v.trim() ? v.trim() : undefined,
  strength: (v) => (v === null || typeof v === 'string' ? v : undefined),
  unit: (v) => typeof v === 'string' && v.trim() ? v.trim() : undefined,
  price_cents: (v) => (Number.isInteger(v) && v >= 0 ? v : undefined),
  active: (v) => (typeof v === 'boolean' ? v : undefined),
};

export async function updateProduct(actor, id, patch = {}) {
  const sets = [], vals = [id];
  for (const [key, check] of Object.entries(EDITABLE)) {
    if (!(key in patch)) continue;
    const v = check(patch[key]);
    if (v === undefined) throw badRequest(`invalid value for ${key}`);
    vals.push(v);
    sets.push(`${key} = $${vals.length}`);
  }
  if (!sets.length) throw badRequest('nothing to update');
  const { rows } = await query(`UPDATE catalog.products SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals);
  if (!rows[0]) throw notFound('Product not found');
  await record(pool, { actorId: actor?.id, action: 'product.updated', entity: 'product', entityId: id, details: patch });
  return rows[0];
}

export async function listProducts() {
  const { rows } = await query(`SELECT * FROM catalog.products WHERE active ORDER BY name`);
  return rows;
}

export async function getProduct(id) {
  const { rows } = await query('SELECT * FROM catalog.products WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function getProducts(ids) {
  if (!ids.length) return [];
  const { rows } = await query('SELECT * FROM catalog.products WHERE id = ANY($1)', [ids]);
  return rows;
}

export async function getActiveProducts(ids) {
  if (!ids.length) return [];
  const { rows } = await query('SELECT * FROM catalog.products WHERE id = ANY($1) AND active', [ids]);
  return rows;
}
