'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import crypto from 'node:crypto';

/**
 * Normalizes a migration definition and attaches helper metadata.
 *
 * @param {object} config Migration configuration
 * @param {string} config.id Unique migration identifier (timestamp prefix recommended)
 * @param {string} [config.description] Optional human-friendly label
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
 * Sorts migrations into execution order using their id. Uses lexical ordering
 * to preserve timestamp-prefixed identifiers.
 *
 * @param {Array<object>} migrations Array of migration objects
 * @returns {Array<object>} Sorted array
 */
export function sortMigrations(migrations = []) {
  return [...migrations].sort((a, b) => (a.id > b.id ? 1 : a.id < b.id ? -1 : 0));
}
