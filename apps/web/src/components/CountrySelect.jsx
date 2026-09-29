/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { listCountries } from '../api/endpoints.js';
import { LookupSelect } from './LookupSelect.jsx';

/**
 * Country lookup control (M0004-R009); `value` is an ISO 3166-1 alpha-2 code.
 * @param {Omit<Parameters<typeof LookupSelect>[0], 'load'|'label'> & {label?: string}} props
 * @returns {JSX.Element}
 */
export function CountrySelect({ label = 'Country', ...props }) {
  return <LookupSelect load={listCountries} label={label} {...props} />;
}
