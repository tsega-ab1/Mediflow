// Identity module public interface.
export { authenticate, requireRole } from './auth.js';
export { authRouter, identityRouter } from './routes.js';
export { createCustomer, createUser, login, getCustomers, ROLES } from './service.js';
