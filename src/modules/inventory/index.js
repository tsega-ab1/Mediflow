// Inventory module public interface.
export { inventoryRouter } from './routes.js';
export { reserveStock, releaseReservations, shipReservations, batchesForOrder, InsufficientStockError } from './service.js';
