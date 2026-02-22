/**
 * @file Permission hash — stable SHA-256 hash of permission objects for token staleness detection
 * @module nap-serv/lib/permHash
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { createHash } from 'node:crypto';

/**
 * Recursively sorts object keys and array elements for deterministic serialization.
 * @param {*} v Value to stabilize
 * @returns {*} Stabilized value
 */
function stable(v) {
  if (Array.isArray(v)) {
    return v.map(stable).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (v && typeof v === 'object') {
    return Object.keys(v)
      .sort()
      .reduce((o, k) => {
        o[k] = stable(v[k]);
        return o;
      }, {});
  }
  return v;
}

/**
 * Compute a deterministic SHA-256 hash of a permissions canon object.
 * @param {object} canon Permissions object (e.g., { caps: { ... } })
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function calcPermHash(canon) {
  const s = JSON.stringify(stable(canon));
  return createHash('sha256').update(s).digest('hex');
}

export default { calcPermHash };
