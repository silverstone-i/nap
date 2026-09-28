/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Grant-pattern helpers for the Roles screen (M0003-R016).
 */

/**
 * Group grant patterns by their module (part 2); `*` becomes "All modules"
 * and sorts first.
 * @param {string[]} grants
 * @returns {Array<{module: string, label: string, grants: string[]}>}
 */
export function groupGrantsByModule(grants) {
  const groups = new Map();
  for (const grant of grants) {
    const module = grant.split('::')[1] ?? '';
    if (!groups.has(module)) groups.set(module, []);
    groups.get(module).push(grant);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '*' ? -1 : b === '*' ? 1 : a.localeCompare(b)))
    .map(([module, items]) => ({
      module,
      label: module === '*' ? 'All modules' : module,
      grants: items.sort(),
    }));
}
