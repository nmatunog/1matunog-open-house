import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'rules',
    environment: 'node',
    globals: true,
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
