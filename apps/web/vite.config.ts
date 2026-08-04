import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/nap/',
  // Fixed port so nap never shares an origin (and thus localStorage) with
  // other local apps; strictPort fails loudly rather than hopping ports.
  server: { port: 5180, strictPort: true },
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
  },
});
