import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Vitest does not put a local .env into process.env on its own, and the
// DB-backed tests key off DATABASE_URL_TEST. Load every variable (empty
// prefix) so a developer's .env drives them the same way CI's exported
// environment does.
export default defineConfig(({ mode }) => ({
  test: {
    env: loadEnv(mode, process.cwd(), ''),
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/**/*.int.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/**/*.int.test.ts'],
        },
      },
    ],
  },
}));
