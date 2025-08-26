'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import fs from 'fs';
import path from 'path';

const apiMap = {
  core: ['v1/addresses', 'v1/contacts', 'v1/inter-companies', 'v1/vendors'],
  activities: [
    'v1/activities',
    'v1/actual-costs',
    'v1/categories',
    'v1/change-order-lines',
    'v1/cost-lines',
    'v1/projects',
    'v1/deliverable-assignments',
    'v1/budgets',
    'v1/deliverables',
    'v1/vendor-parts',
  ],
  tenants: ['v1/nap-users', 'v1/tenants', 'v1/auth'],
  ar: ['v1/receipts', 'v1/clients', 'v1/ar-invoices', 'v1/ar-invoice-lines'],
  ap: ['v1/ap-credit-memos', 'v1/ap-invoices', 'v1/ap-invoice-lines', 'v1/payments'],
  accounting: [
    'v1/categories-account-map',
    'v1/chart-of-accounts',
    'v1/inter-company-accounts',
    'v1/inter-company-transactions',
    'v1/internal-transfers',
    'v1/journal-entries',
    'v1/journal-entry-lines',
    'v1/ledger-balances',
    'v1/posting-queues',
  ],
  projects: [
    '/v1/projects',
    '/v1/units',
    '/v1/template-units',
    '/v1/template-tasks',
    '/v1/template-cost-items',
    '/v1/template-change-orders',
    '/v1/tasks',
    '/v1/task-groups',
    '/v1/tasks-master',
    '/v1/cost-items',
    '/v1/change-orders',
  ],
};

const fullPaths = [];

for (const [module, subRoutes] of Object.entries(apiMap)) {
  for (const route of subRoutes) {
    fullPaths.push(`/api/${module}/${route}`);
  }
}

const outputFile = path.resolve(process.cwd(), 'scripts', 'flattenedApiPaths.json');
fs.writeFileSync(outputFile, JSON.stringify(fullPaths.sort(), null, 2), 'utf-8');
console.log(`✅ Flattened API paths written to ${outputFile}`);
