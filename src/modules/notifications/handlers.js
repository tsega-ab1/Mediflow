import { subscribe } from '../../events.js';
import { getUserIdsByRole, getUserIdsForCustomer } from '../identity/index.js';
import { notify } from './service.js';

const short = (id) => String(id).slice(0, 8);
let registered = false;

// In-app notifications driven by events from other modules.
export function registerNotificationHandlers() {
  if (registered) return;
  registered = true;

  subscribe('OrderPlaced', async ({ orderId }) => {
    await notify(await getUserIdsByRole(['warehouse', 'admin']), {
      type: 'order.placed', title: 'New order to pack',
      body: `Order ${short(orderId)} is confirmed and ready to pack.`, entity: 'order', entityId: orderId,
    });
  });

  subscribe('OrderStatusChanged', async ({ orderId, customerId, status }) => {
    if (!customerId) return;
    await notify(await getUserIdsForCustomer(customerId), {
      type: `order.${status}`, title: `Order ${status}`,
      body: `Your order ${short(orderId)} is now ${status}.`, entity: 'order', entityId: orderId,
    });
  });

  subscribe('BatchRecalled', async ({ batchId, batchNumber, affectedOrderIds }) => {
    const n = affectedOrderIds.length;
    await notify(await getUserIdsByRole(['inventory_manager', 'warehouse', 'admin']), {
      type: 'batch.recalled', title: `Batch ${batchNumber} recalled`,
      body: n ? `${n} open order(s) hold stock from this batch and cannot ship until cancelled.` : 'No open orders hold stock from this batch.',
      entity: 'batch', entityId: batchId,
    });
  });

  subscribe('InvoiceIssued', async ({ invoiceId, number, customerId }) => {
    await notify(await getUserIdsForCustomer(customerId), {
      type: 'invoice.issued', title: `Invoice ${number} issued`,
      body: 'Payment is due within 30 days.', entity: 'invoice', entityId: invoiceId,
    });
  });
}
