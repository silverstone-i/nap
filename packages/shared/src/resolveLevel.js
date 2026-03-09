/**
 * @file Shared RBAC capability resolution — mirrors the server-side
 *       fallback chain in middleware/rbac.js
 * @module @nap/shared/resolveLevel
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

/**
 * Resolve the effective permission level from a capabilities map.
 *
 * Checks most-specific key first, falling back to broader grants:
 *   module::router::action → module::router:: → module:::: → :::: (wildcard)
 *
 * @param {object} caps Capabilities map (key → 'none' | 'view' | 'full')
 * @param {string} moduleName
 * @param {string} routerName
 * @param {string} actionName
 * @returns {string} Resolved level: 'none', 'view', or 'full'
 */
export function resolveLevel(caps, moduleName, routerName, actionName) {
  const keys = [
    `${moduleName}::${routerName}::${actionName}`,
    `${moduleName}::${routerName}::`,
    `${moduleName}::::`,
    '::::',
  ];
  for (const k of keys) {
    const level = caps[k];
    if (level) return level;
  }
  return 'none';
}
