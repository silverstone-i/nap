import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for the nap-client.  This file configures
// the React plugin and enables automatic JSX transformation.  See
// https://vitejs.dev/config/ for more options.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    proxy: {
      // Forward API calls to the backend so cookies work in dev
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
