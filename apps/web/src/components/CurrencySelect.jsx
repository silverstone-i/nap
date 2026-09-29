/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { listCurrencies } from '../api/endpoints.js';
import { LookupSelect } from './LookupSelect.jsx';

/**
 * Currency lookup control (M0004-R009); `value` is an ISO 4217 code.
 * @param {Omit<Parameters<typeof LookupSelect>[0], 'load'|'label'> & {label?: string}} props
 * @returns {JSX.Element}
 */
export function CurrencySelect({ label = 'Currency', ...props }) {
  return <LookupSelect load={listCurrencies} label={label} {...props} />;
}
