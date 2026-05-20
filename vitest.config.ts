import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
    exclude: ['node_modules', 'legacy', 'redesign', '.next'],
    // Dynamic imports of heavy modules (Supabase, Next.js) can exceed the
    // default 5s when many test files run in parallel.
    testTimeout: 15000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
