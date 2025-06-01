'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // hookTimeout: 1000 * 60 * 60, // 1 hour for debugging purposes
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    pool: 'threads', // Use the threads pool (default in Vitest 3.x)
    poolOptions: {
      threads: {
        singleThread: true, // Run tests sequentially in a single thread
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['design_docs/**', 'node_modules/**', 'vitest.config.js'],
    },
    exclude: ['node_modules', 'dist'],
  },
});
