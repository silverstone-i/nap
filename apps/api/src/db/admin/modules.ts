/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { NapModuleDescriptor } from '../modules.js';

/** Production composition root; feature modules register here when delivered. */
export const adminModules: readonly Extract<
  NapModuleDescriptor,
  { databaseTarget: 'admin' }
>[] = [];
