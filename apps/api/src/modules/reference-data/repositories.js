/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Countries } from './models/countries.js';
import { Currencies } from './models/currencies.js';
import { SeedVersions } from './models/seed_versions.js';

/** Table name to model map used to build cell database repositories. */
export const repositories = {
  countries: Countries,
  currencies: Currencies,
  seed_versions: SeedVersions,
};
