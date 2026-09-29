/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** @file Entry point for `npm run db:seed:rollout -- --env <dev|prod>`. */
import { cli } from '../application/maintenance/seedRollout.js';
await cli();
