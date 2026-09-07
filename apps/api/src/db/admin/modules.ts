/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { NapModuleDescriptor } from '../modules.js';

/**
 * Does: Lists every database module that lives in the admin database.
 * Used by: the migrate script to run admin migrations.
 * Why: this is the one place admin modules are registered; a feature adds
 * its descriptor here when it ships. It is empty until the first admin
 * module is delivered.
 */
export const adminModules: readonly Extract<
  NapModuleDescriptor,
  { databaseTarget: 'admin' }
>[] = [];
