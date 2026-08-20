/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Fixed port so nap never shares an origin (and thus localStorage) with
  // other local apps; strictPort fails loudly rather than hopping ports.
  // The /api proxy is the dev-only connectivity seam: the
  // browser sees one origin, so the Path=/api httpOnly cookies flow
  // untouched and the API needs no CORS middleware.
  server: {
    port: 5180,
    strictPort: true,
    proxy: { '/api': 'http://localhost:3000' },
  },
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
  },
});
