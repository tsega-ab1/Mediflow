import jwt from 'jsonwebtoken';
import { config } from '../../config.js';
import { AppError } from '../../errors.js';

export function authenticate(req, _res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return next(new AppError(401, 'Authentication required'));
  try {
    const p = jwt.verify(token, config.jwtSecret);
    req.user = { id: p.sub, role: p.role, customerId: p.customer_id ?? null };
    next();
  } catch {
    next(new AppError(401, 'Invalid or expired token'));
  }
}

export const requireRole = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new AppError(403, 'Forbidden'));
