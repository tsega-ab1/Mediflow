import { Router } from 'express';
import { requireRole } from './auth.js';
import * as svc from './service.js';

export const authRouter = Router();
authRouter.post('/login', async (req, res, next) => {
  try { res.json(await svc.login(req.body)); } catch (e) { next(e); }
});

export const identityRouter = Router();
identityRouter.get('/me', (req, res) => res.json(req.user));
identityRouter.use(requireRole('admin'));
identityRouter.get('/customers', async (_q, res, next) => { try { res.json(await svc.listCustomers()); } catch (e) { next(e); } });
identityRouter.post('/customers', async (req, res, next) => { try { res.status(201).json(await svc.createCustomer(req.user, req.body)); } catch (e) { next(e); } });
identityRouter.get('/users', async (_q, res, next) => { try { res.json(await svc.listUsers()); } catch (e) { next(e); } });
identityRouter.post('/users', async (req, res, next) => { try { res.status(201).json(await svc.createUser(req.user, req.body)); } catch (e) { next(e); } });
