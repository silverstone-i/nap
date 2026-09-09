/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    // Forward browser API requests to the local API while preserving the
    // web origin for session cookies and same-origin checks.
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: { environment: 'jsdom', include: ['tests/**/*.test.{ts,tsx}'] },
});
