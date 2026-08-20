/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineConfig } from 'vitest/config';

// The API has its own config rather than folding into a build config the way
// apps/web does (ADR 0003): nothing bundles this workspace, and Phase 1's
// isolation suite needs a place to hang database setup files.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
