import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['server/**/*.ts'],
      exclude: ['server/index.ts', 'server/refresh.ts', 'server/domain/types.ts'],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 70,
        branches: 65,
      },
    },
  },
});
