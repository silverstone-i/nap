/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { adminModules } from '../../admin.js';
import { cellModules } from '../../cell.js';
import { buildCatalogue, isCatalogued } from './capabilities.js';

let catalogue = null;

/**
 * The capability catalogue of every registered module, admin and cell
 * (M0003-R005), built once on first use.
 * @returns {Readonly<{capability: string, module: string, router: string, action: string}[]>}
 */
export function capabilityCatalogue() {
  catalogue ??= buildCatalogue([...adminModules, ...cellModules]);
  return catalogue;
}

/**
 * Whether a route capability (`module::router::action`) is declared by a
 * registered module.
 * @param {string} capability
 * @returns {boolean}
 */
export function isRegisteredCapability(capability) {
  return isCatalogued(capabilityCatalogue(), capability);
}
