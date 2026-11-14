import { EventEmitter } from 'node:events';

// In-process event bus. Modules announce events here (OrderPlaced, BatchRecalled, ...).
// Future modules (Notifications, Reporting) subscribe; later a broker can replace it.
export const events = new EventEmitter();
