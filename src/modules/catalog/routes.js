import { Router } from 'express';
import { requireRole } from '../identity/index.js';
import { createProduct, listProducts, updateProduct } from './service.js';

export const catalogRouter = Router();

catalogRouter.get('/products', async (_req, res, next) => {
  try { res.json(await listProducts()); } catch (e) { next(e); }
});
catalogRouter.post('/products', requireRole('admin'), async (req, res, next) => {
  try { res.status(201).json(await createProduct(req.user, req.body)); } catch (e) { next(e); }
});
catalogRouter.patch('/products/:id', requireRole('admin'), async (req, res, next) => {
  try { res.json(await updateProduct(req.user, req.params.id, req.body)); } catch (e) { next(e); }
});
