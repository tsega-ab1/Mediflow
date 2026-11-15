import { EventEmitter } from 'node:events';

// In-process event bus. Modules announce events here (OrderPlaced, OrderStatusChanged,
// BatchRecalled, InvoiceIssued). Other modules subscribe; later a broker can replace it.
export const events = new EventEmitter();

const pending = new Set();

// Handlers run after the publisher's transaction has committed. A failing handler is
// logged and never breaks the request that caused the event.
export function subscribe(name, handler) {
  events.on(name, (payload) => {
    const p = Promise.resolve()
      .then(() => handler(payload))
      .catch((err) => console.error(`[event ${name}]`, err))
      .finally(() => pending.delete(p));
    pending.add(p);
  });
}

// Resolves when every running handler (and any they trigger) has finished. Used by tests.
export async function settled() {
  while (pending.size) await Promise.allSettled([...pending]);
}
