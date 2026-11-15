import { Router } from 'express';
import { requireRole } from '../identity/index.js';
import { overview, stockCsv } from './service.js';

export const reportingRouter = Router();
reportingRouter.use(requireRole('admin', 'inventory_manager'));

const int = (v, def, min, max) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? def : Math.min(Math.max(n, min), max);
};

reportingRouter.get('/overview', async (req, res, next) => {
  try {
    res.json(await overview(req.user, {
      lowStock: int(req.query.low_stock, 20, 0, 1000000),
      expiringDays: int(req.query.expiring_days, 120, 1, 1825),
    }));
  } catch (e) { next(e); }
});
reportingRouter.get('/stock.csv', async (_req, res, next) => {
  try { res.type('text/csv').attachment('stock.csv').send(await stockCsv()); } catch (e) { next(e); }
});
