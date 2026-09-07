/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { NapModuleDescriptor } from '../modules.js';

/**
 * Does: Lists every database module that lives in a cell database.
 * Used by: the migrate script to run cell migrations.
 * Why: this is the one place cell modules are registered; a feature adds
 * its descriptor here when it ships. It is empty until the first cell
 * module is delivered.
 */
export const cellModules: readonly Extract<
  NapModuleDescriptor,
  { databaseTarget: 'cell' }
>[] = [];
