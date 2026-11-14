import { Router } from 'express';
import { requireRole } from '../identity/index.js';
import { advanceOrder, cancelOrder, createOrder, getOrder, listOrders } from './service.js';

export const ordersRouter = Router();
const VIEWERS = ['customer', 'warehouse', 'admin'];

ordersRouter.post('/', requireRole('customer'), async (req, res, next) => {
  try { res.status(201).json(await createOrder(req.user, req.body?.items)); } catch (e) { next(e); }
});
ordersRouter.get('/', requireRole(...VIEWERS), async (req, res, next) => {
  try { res.json(await listOrders(req.user, { status: req.query.status })); } catch (e) { next(e); }
});
ordersRouter.get('/:id', requireRole(...VIEWERS), async (req, res, next) => {
  try { res.json(await getOrder(req.user, req.params.id)); } catch (e) { next(e); }
});
ordersRouter.post('/:id/status', requireRole('warehouse', 'admin'), async (req, res, next) => {
  try { res.json(await advanceOrder(req.user, req.params.id, req.body?.status)); } catch (e) { next(e); }
});
ordersRouter.post('/:id/cancel', requireRole(...VIEWERS), async (req, res, next) => {
  try { res.json(await cancelOrder(req.user, req.params.id)); } catch (e) { next(e); }
});
