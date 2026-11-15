import { Router } from 'express';
import { listFor, markAllRead, markRead, unreadCount } from './service.js';

export const notificationsRouter = Router();

notificationsRouter.get('/', async (req, res, next) => {
  try { res.json(await listFor(req.user.id, { unread: req.query.unread === 'true' })); } catch (e) { next(e); }
});
notificationsRouter.get('/unread-count', async (req, res, next) => {
  try { res.json({ count: await unreadCount(req.user.id) }); } catch (e) { next(e); }
});
notificationsRouter.post('/read-all', async (req, res, next) => {
  try { res.json(await markAllRead(req.user.id)); } catch (e) { next(e); }
});
notificationsRouter.post('/:id/read', async (req, res, next) => {
  try { res.json(await markRead(req.user.id, req.params.id)); } catch (e) { next(e); }
});
