/**
 * @file Migration definition helper — normalizes config and attaches checksums
 * @module nap-serv/db/migrations/defineMigration
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import crypto from 'node:crypto';

/**
 * Normalizes a migration definition and attaches helper metadata.
 * @param {object} config Migration configuration
 * @param {string} config.id Unique migration identifier
 * @param {string} [config.description] Human-friendly label
 * @param {Function} config.up Async function that performs the migration
 * @param {Function} [config.down] Async function that reverts the migration
 * @returns {object} Normalized migration object
 */
export function defineMigration(config) {
  if (!config || typeof config !== 'object') {
    throw new TypeError('defineMigration expects a configuration object');
  }

  const { id, description = null, up, down = async () => {} } = config;

  if (!id || typeof id !== 'string') {
    throw new TypeError('Migration id must be a non-empty string');
  }
  if (typeof up !== 'function') {
    throw new TypeError(`Migration "${id}" must provide an async up() function`);
  }
  if (typeof down !== 'function') {
    throw new TypeError(`Migration "${id}" must provide a down() function (use noop if unsupported)`);
  }

  return Object.freeze({
    id,
    description,
    up,
    down,
    checksum: crypto.createHash('sha256').update(id + (description ?? '')).digest('hex'),
  });
}

/**
 * Sorts migrations by id (lexical ordering preserves timestamp prefixes).
 * @param {Array<object>} migrations
 * @returns {Array<object>}
 */
export function sortMigrations(migrations = []) {
  return [...migrations].sort((a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0));
}
