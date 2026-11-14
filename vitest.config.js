import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false, // tests share one real PostgreSQL database
    testTimeout: 20000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://mediflow:mediflow@localhost:5432/mediflow',
      BCRYPT_ROUNDS: '4',
      NEAR_EXPIRY_DAYS: '90',
    },
  },
});
