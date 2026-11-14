// Demo data: staff accounts, two customers, products and batches. Safe to run twice.
import { pool } from '../src/db.js';
import { createCustomer, createUser } from '../src/modules/identity/index.js';
import { receiveBatch } from '../src/modules/inventory/service.js';
import { createProduct } from '../src/modules/catalog/service.js';

const password = process.env.SEED_PASSWORD || 'Passw0rd!demo';
const days = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ignoreDuplicate = (e) => { if (e.status !== 409) throw e; };

const { rows: existing } = await pool.query('SELECT 1 FROM identity.users LIMIT 1');
if (existing.length) {
  console.log('Users already exist; skipping seed.');
  await pool.end();
  process.exit(0);
}

for (const [email, role] of [['admin@mediflow.local', 'admin'], ['manager@mediflow.local', 'inventory_manager'], ['warehouse@mediflow.local', 'warehouse']])
  await createUser(null, { email, password, role });

for (const [name, email] of [['Selam Pharmacy', 'selam@mediflow.local'], ['Bole Clinic', 'bole@mediflow.local']]) {
  const c = await createCustomer(null, { name });
  await createUser(null, { email, password, role: 'customer', customer_id: c.id });
}

const products = [
  { name: 'Amoxicillin', sku: 'AMX-500', strength: '500mg', unit: 'capsule', price_cents: 250 },
  { name: 'Paracetamol', sku: 'PCM-500', strength: '500mg', unit: 'tablet', price_cents: 80 },
  { name: 'Ibuprofen', sku: 'IBU-400', strength: '400mg', unit: 'tablet', price_cents: 120 },
  { name: 'Oral Rehydration Salts', sku: 'ORS-1', strength: null, unit: 'sachet', price_cents: 300 },
];
const made = [];
for (const p of products) made.push(await createProduct(null, p).catch((e) => { ignoreDuplicate(e); }));

const [amx, pcm, ibu, ors] = made;
const batches = [
  [amx, 'AMX-2601', 100, 200], [amx, 'AMX-2602', 150, 400],
  [pcm, 'PCM-2601', 500, 300], [pcm, 'PCM-NEAR', 80, 30], // near expiry: never allocated
  [ibu, 'IBU-2601', 5, 250], [ors, 'ORS-2601', 200, 500],
];
for (const [p, batch_number, quantity, d] of batches)
  await receiveBatch(null, { product_id: p.id, batch_number, quantity, expiry_date: days(d) }).catch(ignoreDuplicate);

console.log(`Seeded. Log in with any of: admin@ manager@ warehouse@ selam@ bole@mediflow.local / ${password}`);
await pool.end();
