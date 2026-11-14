import { Router } from 'express';
import { requireRole } from '../identity/index.js';
import { listAudit } from './service.js';

export const auditRouter = Router();
auditRouter.get('/', requireRole('admin'), async (req, res, next) => {
  try {
    res.json(await listAudit({ entity: req.query.entity, entityId: req.query.entity_id, limit: req.query.limit }));
  } catch (e) { next(e); }
});
