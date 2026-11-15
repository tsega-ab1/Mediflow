import express from 'express';
import { AppError } from './errors.js';
import { auditRouter } from './modules/audit/index.js';
import { billingRouter, registerBillingHandlers } from './modules/billing/index.js';
import { catalogRouter } from './modules/catalog/index.js';
import { authRouter, authenticate, identityRouter } from './modules/identity/index.js';
import { inventoryRouter } from './modules/inventory/index.js';
import { notificationsRouter, registerNotificationHandlers } from './modules/notifications/index.js';
import { ordersRouter } from './modules/orders/index.js';
import { reportingRouter } from './modules/reporting/index.js';

export function createApp() {
  registerBillingHandlers();
  registerNotificationHandlers();
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/auth', authRouter);

  app.use(authenticate); // everything below requires a valid login
  app.use('/identity', identityRouter);
  app.use('/catalog', catalogRouter);
  app.use('/inventory', inventoryRouter);
  app.use('/orders', ordersRouter);
  app.use('/billing', billingRouter);
  app.use('/notifications', notificationsRouter);
  app.use('/reports', reportingRouter);
  app.use('/audit', auditRouter);

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((err, _req, res, _next) => {
    if (err instanceof AppError) return res.status(err.status).json({ error: err.message });
    if (err.code === '22P02') return res.status(400).json({ error: 'Invalid id' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
