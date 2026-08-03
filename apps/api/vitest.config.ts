import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Vitest does not put a local .env into process.env on its own, and the
// DB-backed tests key off DATABASE_URL_TEST. Load every variable (empty
// prefix) so a developer's .env drives them the same way CI's exported
// environment does.
export default defineConfig(({ mode }) => ({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    env: loadEnv(mode, process.cwd(), ''),
  },
}));
