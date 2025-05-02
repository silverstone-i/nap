'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

// This schema is used to define the structure of the activity profitability view
export default {
  dbSchema: 'tenantid',
  table: 'activity_profitability_view',
  version: '1.0.0',
  columns: [
    { name: 'activity_id', type: 'uuid' },
    { name: 'tenant_id', type: 'uuid' },
    { name: 'project_id', type: 'uuid' },
    { name: 'source_type', type: 'varchar' },
    { name: 'activity_name', type: 'varchar' },
    { name: 'budgeted_cost', type: 'numeric' },
    { name: 'budgeted_price', type: 'numeric' },
    { name: 'actual_cost', type: 'numeric' },
    { name: 'actual_price', type: 'numeric' },
    { name: 'profit', type: 'numeric' },
    { name: 'price_variance', type: 'numeric' },
    { name: 'cost_variance', type: 'numeric' }
  ],
  constraints: {
    primaryKey: ['activity_id', 'project_id', 'source_type']
  },
}
