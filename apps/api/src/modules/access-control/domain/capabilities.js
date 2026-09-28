/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { parseCapability } from './patterns.js';

/** Thrown when a descriptor's capability declarations are invalid (M0003-R005). */
export class CapabilityDeclarationError extends Error {
  constructor() {
    super('INVALID_CAPABILITIES');
    this.code = 'INVALID_CAPABILITIES';
  }
}

/**
 * Validate one descriptor's `capabilities` (M0003-R005): an array of distinct
 * `module::router::action` strings whose module is the descriptor's own name
 * and whose router and action are lowercase identifiers.
 *
 * The rule that `read` is used only by `GET` routes cannot be checked from the
 * string alone; I0005's startup route check (I0005-R002) enforces it against
 * the mounted routes.
 * @param {{name: string, capabilities?: unknown}} descriptor
 * @returns {{module: string, router: string, action: string}[]} The parsed declarations.
 * @throws {CapabilityDeclarationError}
 */
export function parseDeclarations(descriptor) {
  const declared = descriptor?.capabilities;
  if (!Array.isArray(declared)) throw new CapabilityDeclarationError();
  const seen = new Set();
  return declared.map(value => {
    const parsed = parseCapability(value);
    if (!parsed || parsed.module !== descriptor.name || seen.has(value))
      throw new CapabilityDeclarationError();
    seen.add(value);
    return parsed;
  });
}

/**
 * Build the capability catalogue: the union of every descriptor's declared
 * capabilities (M0003-R005), sorted, without the tenant part.
 * @param {object[]} descriptors Module descriptors.
 * @returns {Readonly<{capability: string, module: string, router: string, action: string}[]>}
 * @throws {CapabilityDeclarationError}
 */
export function buildCatalogue(descriptors) {
  const entries = descriptors
    .flatMap(descriptor => parseDeclarations(descriptor))
    .map(entry => ({
      capability: `${entry.module}::${entry.router}::${entry.action}`,
      ...entry,
    }));
  entries.sort((a, b) => a.capability.localeCompare(b.capability));
  return Object.freeze(entries.map(entry => Object.freeze(entry)));
}

/**
 * Whether `capability` (`module::router::action`) is in the catalogue.
 * @param {{capability: string}[]} catalogue
 * @param {string} capability
 * @returns {boolean}
 */
export function isCatalogued(catalogue, capability) {
  return catalogue.some(entry => entry.capability === capability);
}
