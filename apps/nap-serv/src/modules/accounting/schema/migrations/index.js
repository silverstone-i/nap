/**
 * @file Accounting module migrations index
 * @module accounting/schema/migrations
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import accountingTables from './202502110070_accountingTables.js';
import statusChecks from './202503050071_statusChecks.js';

export default [accountingTables, statusChecks];
