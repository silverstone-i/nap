/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Each integration worker may start its own PostgreSQL cluster. Bound concurrent
  // clusters to avoid exhausting local startup resources during the full suite.
  test: { environment: 'node', include: ['tests/**/*.test.ts'], maxWorkers: 4 },
});
