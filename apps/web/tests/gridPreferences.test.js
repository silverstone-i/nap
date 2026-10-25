/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { RECORDS_PER_PAGE } from '@nap/shared';
import { GRID_PAGE_SIZE_OPTIONS } from '../src/grid/gridPreferences.js';

describe('grid page sizes', () => {
  it('offers exactly the records-per-page values (I0001-R015, M0006-03-R008)', () => {
    expect(GRID_PAGE_SIZE_OPTIONS).toEqual([25, 50, 100]);
    expect(GRID_PAGE_SIZE_OPTIONS).toBe(RECORDS_PER_PAGE);
  });
});
