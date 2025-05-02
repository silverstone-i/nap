

export default {
  dbSchema: 'tenantid',
  table: 'project_actuals_profitability_view',
  version: '1.0.0',
  columns: [
    { name: 'project_id', type: 'uuid' },
    { name: 'tenant_id', type: 'uuid' },
    { name: 'project_name', type: 'varchar' },
    { name: 'project_code', type: 'varchar' },
    { name: 'total_budgeted_cost', type: 'numeric' },
    { name: 'total_budgeted_price', type: 'numeric' },
    { name: 'actual_cost', type: 'numeric' },
    { name: 'actual_price', type: 'numeric' },
    { name: 'profit', type: 'numeric' },
    { name: 'cost_variance', type: 'numeric' },
    { name: 'price_variance', type: 'numeric' }
  ],
  constraints: {
    primaryKey: ['project_id']
  }
};