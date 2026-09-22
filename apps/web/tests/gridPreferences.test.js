/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_GRID_PAGE_SIZE,
  GRID_PAGE_SIZE_OPTIONS,
  readGridPageSize,
  writeGridPageSize,
} from '../src/grid/gridPreferences.js';

afterEach(() => {
  window.localStorage.clear();
});

describe('grid page-size preference', () => {
  it('defaults to 25 when nothing is stored', () => {
    expect(readGridPageSize()).toBe(DEFAULT_GRID_PAGE_SIZE);
    expect(DEFAULT_GRID_PAGE_SIZE).toBe(25);
    expect(GRID_PAGE_SIZE_OPTIONS).toEqual([25, 50, 100]);
  });

  it('persists a valid choice and applies it to a later read — the one shared preference (F0001-R015)', () => {
    writeGridPageSize(50);
    expect(readGridPageSize()).toBe(50);
  });

  it('ignores an out-of-range stored or requested value', () => {
    window.localStorage.setItem('nap.gridPageSize', '17');
    expect(readGridPageSize()).toBe(DEFAULT_GRID_PAGE_SIZE);
    writeGridPageSize(17);
    expect(readGridPageSize()).toBe(DEFAULT_GRID_PAGE_SIZE);
  });
});
