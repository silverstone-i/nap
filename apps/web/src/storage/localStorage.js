/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Browser-local preference storage. Every key here is one the PRD
 * explicitly allows to survive logout (F0001 §9): display mode and the
 * standard-grid page size. Never store session, credential, tenant, or
 * role data through this module.
 */

/** Namespaced localStorage keys. */
export const STORAGE_KEYS = Object.freeze({
  displayMode: 'nap.displayMode',
  gridPageSize: 'nap.gridPageSize',
});

/**
 * Read a raw string from `localStorage`, tolerating a browser that blocks or
 * throws on storage access (private mode, disabled site data).
 * @param {string} key
 * @returns {string|null}
 */
export function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Write a raw string to `localStorage`, swallowing a blocked or full store.
 * @param {string} key
 * @param {string} value
 * @returns {void}
 */
export function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Best-effort only: a preference that fails to persist still works for
    // the current page load, which is all this feature promises.
  }
}
