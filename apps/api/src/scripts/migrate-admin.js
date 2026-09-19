/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** @file Entry point for `npm run db:migrate:admin -- --env <dev|test|prod>`. */
import { cli } from '../application/maintenance/admin.js';
await cli('migrate');
