const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production');

export const config = {
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  // Batches expiring within this many days are never allocated.
  nearExpiryDays: Number(process.env.NEAR_EXPIRY_DAYS ?? 90),
  bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
};
