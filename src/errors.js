export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const badRequest = (m) => new AppError(400, m);
export const notFound = (m = 'Not found') => new AppError(404, m);
export const conflict = (m) => new AppError(409, m);
