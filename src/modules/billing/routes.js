import { Router } from 'express';
import { requireRole } from '../identity/index.js';
import { getInvoice, issueInvoiceForOrder, listInvoices, markPaid } from './service.js';

export const billingRouter = Router();
const VIEWERS = ['customer', 'admin'];

billingRouter.get('/invoices', requireRole(...VIEWERS), async (req, res, next) => {
  try { res.json(await listInvoices(req.user, { status: req.query.status })); } catch (e) { next(e); }
});
billingRouter.get('/invoices/:id', requireRole(...VIEWERS), async (req, res, next) => {
  try { res.json(await getInvoice(req.user, req.params.id)); } catch (e) { next(e); }
});
billingRouter.post('/invoices/:id/pay', requireRole('admin'), async (req, res, next) => {
  try { res.json(await markPaid(req.user, req.params.id, req.body)); } catch (e) { next(e); }
});
// Safety net: (re)issue the invoice of a shipped order if the automatic step was missed.
billingRouter.post('/orders/:orderId/invoice', requireRole('admin'), async (req, res, next) => {
  try { res.json(await issueInvoiceForOrder(req.params.orderId, req.user)); } catch (e) { next(e); }
});
