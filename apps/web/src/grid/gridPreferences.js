/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  STORAGE_KEYS,
  readStorage,
  writeStorage,
} from '../storage/localStorage.js';

/** The only page sizes a standard grid may offer (I0001-R015). */
export const GRID_PAGE_SIZE_OPTIONS = Object.freeze([25, 50, 100]);

export const DEFAULT_GRID_PAGE_SIZE = 25;

/**
 * Read the one browser-local page-size preference shared across every
 * standard grid in the app.
 * @returns {number}
 */
export function readGridPageSize() {
  const stored = Number(readStorage(STORAGE_KEYS.gridPageSize));
  return GRID_PAGE_SIZE_OPTIONS.includes(stored)
    ? stored
    : DEFAULT_GRID_PAGE_SIZE;
}

/**
 * Persist the shared page-size preference.
 * @param {number} pageSize
 * @returns {void}
 */
export function writeGridPageSize(pageSize) {
  if (!GRID_PAGE_SIZE_OPTIONS.includes(pageSize)) return;
  writeStorage(STORAGE_KEYS.gridPageSize, String(pageSize));
}
