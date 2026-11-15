import { subscribe } from '../../events.js';
import { issueInvoiceForOrder } from './service.js';

let registered = false;

// An invoice is issued automatically when an order ships.
export function registerBillingHandlers() {
  if (registered) return;
  registered = true;
  subscribe('OrderStatusChanged', async ({ orderId, status }) => {
    if (status === 'shipped') await issueInvoiceForOrder(orderId);
  });
}
