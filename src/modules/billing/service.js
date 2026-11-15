import { pool, query, withTransaction } from '../../db.js';
import { events } from '../../events.js';
import { badRequest, conflict, notFound } from '../../errors.js';
import { record } from '../audit/index.js';
import { getCustomers } from '../identity/index.js';
import { getOrderForBilling } from '../orders/index.js';

const PAYMENT_TERMS_DAYS = 30;
const SELECT = `SELECT *, (status = 'issued' AND due_at < now()) AS overdue FROM billing.invoices`;

// Creates the invoice for a shipped order from the prices locked at order time.
// Safe to call twice: an order only ever has one invoice.
export async function issueInvoiceForOrder(orderId, actor = null) {
  const order = await getOrderForBilling(orderId);
  if (!order) throw notFound('Order not found');
  if (!['shipped', 'delivered'].includes(order.status)) throw conflict('Only shipped orders can be invoiced');

  let created = false;
  let invoice;
  try {
    invoice = await withTransaction(async (c) => {
      const { rows: [existing] } = await c.query('SELECT * FROM billing.invoices WHERE order_id = $1', [orderId]);
      if (existing) return existing;
      const { rows: [{ n }] } = await c.query("SELECT nextval('billing.invoice_number_seq') AS n");
      const number = `INV-${new Date().getFullYear()}-${String(n).padStart(6, '0')}`;
      const total = order.items.reduce((s, i) => s + i.quantity * i.unit_price_cents, 0);
      const { rows: [inv] } = await c.query(
        `INSERT INTO billing.invoices (number, order_id, customer_id, total_cents, due_at)
         VALUES ($1,$2,$3,$4, now() + ($5::int * interval '1 day')) RETURNING *`,
        [number, orderId, order.customer_id, total, PAYMENT_TERMS_DAYS]);
      for (const i of order.items) {
        await c.query(
          `INSERT INTO billing.invoice_lines (invoice_id, product_id, description, unit_price_cents, quantity, line_total_cents)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [inv.id, i.product_id, `${i.name}${i.sku ? ` (${i.sku})` : ''}`, i.unit_price_cents, i.quantity, i.quantity * i.unit_price_cents]);
      }
      await record(c, { actorId: actor?.id, action: 'invoice.issued', entity: 'invoice', entityId: inv.id,
        details: { number, order_id: orderId, total_cents: total } });
      created = true;
      return inv;
    });
  } catch (e) {
    if (e.code !== '23505') throw e; // a concurrent call created it first
    invoice = (await query('SELECT * FROM billing.invoices WHERE order_id = $1', [orderId])).rows[0];
  }
  if (created) {
    events.emit('InvoiceIssued', { invoiceId: invoice.id, number: invoice.number, customerId: invoice.customer_id, orderId });
  }
  return invoice;
}

const mine = (user, inv) => inv && (user.role !== 'customer' || inv.customer_id === user.customerId);

export async function listInvoices(user, { status } = {}) {
  if (status && !['issued', 'paid', 'overdue'].includes(status)) throw badRequest('invalid status filter');
  const { rows } = await query(
    `SELECT * FROM (${SELECT}) i
     WHERE ($1::uuid IS NULL OR customer_id = $1)
       AND ($2::text IS NULL OR ($2 = 'overdue' AND overdue) OR ($2 <> 'overdue' AND status = $2))
     ORDER BY issued_at DESC LIMIT 200`,
    [user.role === 'customer' ? user.customerId : null, status ?? null]);
  if (user.role === 'customer') return rows;
  const names = new Map((await getCustomers([...new Set(rows.map((r) => r.customer_id))])).map((c) => [c.id, c.name]));
  return rows.map((r) => ({ ...r, customer_name: names.get(r.customer_id) ?? null }));
}

export async function getInvoice(user, id) {
  const { rows: [inv] } = await query(`${SELECT} WHERE id = $1`, [id]);
  if (!mine(user, inv)) throw notFound('Invoice not found');
  const { rows: lines } = await query('SELECT * FROM billing.invoice_lines WHERE invoice_id = $1 ORDER BY description', [id]);
  const [customer] = await getCustomers([inv.customer_id]);
  return { ...inv, customer_name: customer?.name ?? null, lines };
}

// Payments are recorded by an admin (no payment gateway in this release).
export async function markPaid(actor, id, { reference } = {}) {
  if (reference != null && (typeof reference !== 'string' || reference.length > 100)) throw badRequest('reference must be text up to 100 characters');
  await withTransaction(async (c) => {
    const { rows: [inv] } = await c.query('SELECT * FROM billing.invoices WHERE id = $1 FOR UPDATE', [id]);
    if (!inv) throw notFound('Invoice not found');
    if (inv.status === 'paid') throw conflict('Invoice is already paid');
    await c.query(
      `UPDATE billing.invoices SET status = 'paid', paid_at = now(), paid_by = $2, payment_reference = $3 WHERE id = $1`,
      [id, actor.id, reference?.trim() || null]);
    await record(c, { actorId: actor.id, action: 'invoice.paid', entity: 'invoice', entityId: id,
      details: { number: inv.number, total_cents: inv.total_cents, reference: reference ?? null } });
  });
  return getInvoice(actor, id);
}

export async function billingStats() {
  const { rows: [r] } = await pool.query(`
    SELECT
      COALESCE(sum(total_cents) FILTER (WHERE issued_at > now() - interval '30 days'), 0)::bigint AS invoiced_last_30_days,
      COALESCE(sum(total_cents) FILTER (WHERE status = 'issued'), 0)::bigint AS outstanding,
      COALESCE(sum(total_cents) FILTER (WHERE status = 'issued' AND due_at < now()), 0)::bigint AS overdue_total,
      (count(*) FILTER (WHERE status = 'issued' AND due_at < now()))::int AS overdue_count
    FROM billing.invoices`);
  return r;
}
