/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { ApiError } from '../api/client.js';

/**
 * Whether a create or rename was refused because an archived record holds
 * the value (I0011-R008, R010).
 * @param {unknown} err
 * @returns {boolean}
 */
export function isArchivedConflict(err) {
  return (
    err instanceof ApiError &&
    err.code === 'CONFLICT' &&
    err.details?.archived === true
  );
}

/**
 * The Archived view of `path` searched for `value` (I0011-R008).
 * @param {string} path
 * @param {string} value
 * @returns {string}
 */
export function archivedSearchPath(path, value) {
  return `${path}?${new URLSearchParams({ view: 'archived', q: value })}`;
}
