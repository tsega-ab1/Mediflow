import { billingStats } from '../billing/index.js';
import { listProducts, getProducts } from '../catalog/index.js';
import { expiringBatches, stockSummary } from '../inventory/index.js';
import { orderStats, topProducts } from '../orders/index.js';

// Reporting reads only through other modules' interfaces, never their tables.
async function stockRows() {
  const [products, summary] = await Promise.all([listProducts(), stockSummary()]);
  const byProduct = new Map(summary.map((s) => [s.product_id, s]));
  return products.map((p) => {
    const s = byProduct.get(p.id);
    return { product_id: p.id, name: p.name, sku: p.sku, on_hand: s?.on_hand ?? 0, reserved: s?.reserved ?? 0, sellable: s?.sellable ?? 0 };
  });
}

export async function overview(user, { lowStock = 20, expiringDays = 120 } = {}) {
  const [orders, top, stock, expiring, billing] = await Promise.all([
    orderStats(), topProducts({ days: 30, limit: 5 }), stockRows(), expiringBatches(expiringDays),
    user.role === 'admin' ? billingStats() : null,
  ]);
  const names = new Map((await getProducts([...new Set([...top, ...expiring].map((x) => x.product_id))])).map((p) => [p.id, p]));
  const label = (x) => ({ ...x, name: names.get(x.product_id)?.name, sku: names.get(x.product_id)?.sku });
  return {
    generated_at: new Date().toISOString(),
    thresholds: { low_stock: lowStock, expiring_days: expiringDays },
    orders,
    ...(billing ? { billing } : {}),
    top_products: top.map(label),
    low_stock: stock.filter((s) => s.sellable <= lowStock).sort((a, b) => a.sellable - b.sellable),
    expiring_batches: expiring.map(label),
  };
}

const csvCell = (v) => {
  const s = String(v ?? '');
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // stop spreadsheet formula injection
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function stockCsv() {
  const rows = await stockRows();
  const lines = [['sku', 'name', 'on_hand', 'reserved', 'sellable'], ...rows.map((r) => [r.sku, r.name, r.on_hand, r.reserved, r.sellable])];
  return lines.map((l) => l.map(csvCell).join(',')).join('\n') + '\n';
}
