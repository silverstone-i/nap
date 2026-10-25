/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { RECORDS_PER_PAGE } from '@nap/shared';

/**
 * The only page sizes a standard grid may offer (I0001-R015). They are the
 * values `recordsPerPage` allows, because a grid starts at the member's
 * effective `recordsPerPage` and saves a new choice as their override
 * (M0006-03-R008).
 */
export const GRID_PAGE_SIZE_OPTIONS = RECORDS_PER_PAGE;
