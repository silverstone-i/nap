/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export {
  closeDb,
  getDb,
  initDb,
  isDbInitialized,
  probeDb,
  resolveConnectionString,
} from './connection.js';
export {
  collectRepositories,
  moduleRegistry,
  modulesForScope,
} from './registry.js';
export type { NapModule, SchemaScope } from './registry.js';
