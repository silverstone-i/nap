'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

// import fetch from 'node-fetch'; // must be run as ESM or use .mjs extension

const baseUrl = 'http://localhost:3000/api/tenants/v1/tenants/ping';

async function pingApi() {
  try {
    const res = await fetch(baseUrl);
    const data = await res.json();
    console.log(`✅ API responded:`, data);
  } catch (err) {
    console.error(`❌ Error pinging API:`, err.message);
    process.exit(1);
  }
}

pingApi();
