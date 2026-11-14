import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool, query } from '../../db.js';
import { config } from '../../config.js';
import { AppError, badRequest, conflict } from '../../errors.js';
import { record } from '../audit/index.js';

export const ROLES = ['customer', 'warehouse', 'inventory_manager', 'admin'];

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 4);
const publicUser = ({ password_hash, ...u }) => u;

export async function createCustomer(actor, { name } = {}) {
  if (!name?.trim()) throw badRequest('name is required');
  const { rows } = await query('INSERT INTO identity.customers (name) VALUES ($1) RETURNING *', [name.trim()]);
  await record(pool, { actorId: actor?.id, action: 'customer.created', entity: 'customer', entityId: rows[0].id, details: { name: rows[0].name } });
  return rows[0];
}

export async function listCustomers() {
  const { rows } = await query('SELECT * FROM identity.customers ORDER BY name');
  return rows;
}

export async function getCustomers(ids) {
  if (!ids.length) return [];
  const { rows } = await query('SELECT * FROM identity.customers WHERE id = ANY($1)', [ids]);
  return rows;
}

export async function createUser(actor, { email, password, role, customer_id } = {}) {
  const errors = [];
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) errors.push('a valid email is required');
  if (typeof password !== 'string' || password.length < 8) errors.push('password must be at least 8 characters');
  if (!ROLES.includes(role)) errors.push(`role must be one of: ${ROLES.join(', ')}`);
  if (role === 'customer' && !customer_id) errors.push('customer_id is required for customer users');
  if (role !== 'customer' && customer_id) errors.push('customer_id is only for customer users');
  if (errors.length) throw badRequest(errors.join('; '));

  const hash = await bcrypt.hash(password, config.bcryptRounds);
  try {
    const { rows } = await query(
      `INSERT INTO identity.users (email, password_hash, role, customer_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [email.trim().toLowerCase(), hash, role, customer_id ?? null]
    );
    await record(pool, { actorId: actor?.id, action: 'user.created', entity: 'user', entityId: rows[0].id, details: { email: rows[0].email, role } });
    return publicUser(rows[0]);
  } catch (e) {
    if (e.code === '23505') throw conflict('Email already in use');
    if (e.code === '23503') throw badRequest('Unknown customer_id');
    throw e;
  }
}

export async function listUsers() {
  const { rows } = await query('SELECT * FROM identity.users ORDER BY created_at');
  return rows.map(publicUser);
}

export async function login({ email, password } = {}) {
  const { rows } = await query('SELECT * FROM identity.users WHERE email = $1', [String(email ?? '').trim().toLowerCase()]);
  const user = rows[0];
  const ok = await bcrypt.compare(String(password ?? ''), user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new AppError(401, 'Invalid email or password');
  const token = jwt.sign({ role: user.role, customer_id: user.customer_id }, config.jwtSecret, {
    subject: user.id,
    expiresIn: '8h',
  });
  return { token, user: publicUser(user) };
}
