import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'app',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/app/setup.ts'],
    include: ['tests/app/**/*.test.ts', 'tests/app/**/*.test.tsx'],
  },
});
