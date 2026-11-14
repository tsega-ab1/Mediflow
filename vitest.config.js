import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false, // tests share one real PostgreSQL database
    testTimeout: 20000,
    env: {
      // Tests WIPE their database. Never use your dev database here.
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ||
        (process.env.CI && process.env.DATABASE_URL) ||
        'postgres://mediflow:mediflow@localhost:5432/mediflow_test',
      BCRYPT_ROUNDS: '4',
      NEAR_EXPIRY_DAYS: '90',
    },
  },
});
