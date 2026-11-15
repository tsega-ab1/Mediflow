// Inventory module public interface.
export { inventoryRouter } from './routes.js';
export { reserveStock, releaseReservations, shipReservations, batchesForOrder, stockSummary, expiringBatches, InsufficientStockError } from './service.js';
