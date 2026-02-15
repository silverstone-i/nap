/**
 * @file Vite configuration for nap-client
 * @module nap-client/vite.config
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    sourcemap: true,
  },
});
