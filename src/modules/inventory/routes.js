import { Router } from 'express';
import { requireRole } from '../identity/index.js';
import { listBatches, receiveBatch, setBatchStatus } from './service.js';

export const inventoryRouter = Router();
const STAFF = ['warehouse', 'inventory_manager', 'admin'];
const MANAGERS = ['inventory_manager', 'admin'];

inventoryRouter.get('/batches', requireRole(...STAFF), async (req, res, next) => {
  try { res.json(await listBatches({ product_id: req.query.product_id })); } catch (e) { next(e); }
});
inventoryRouter.post('/batches', requireRole(...MANAGERS), async (req, res, next) => {
  try { res.status(201).json(await receiveBatch(req.user, req.body)); } catch (e) { next(e); }
});
inventoryRouter.patch('/batches/:id/status', requireRole(...MANAGERS), async (req, res, next) => {
  try { res.json(await setBatchStatus(req.user, req.params.id, req.body?.status)); } catch (e) { next(e); }
});
