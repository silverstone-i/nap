'use strict';

import { createHash } from 'node:crypto';

// Stable serializer: sort object keys and array elements deterministically
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

export function calcPermHash(canon) {
  const s = JSON.stringify(stable(canon));
  return createHash('sha256').update(s).digest('hex');
}

export default { calcPermHash };
