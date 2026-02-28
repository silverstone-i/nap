/**
 * @file Schema definition for tenant-scope numbering configuration table
 * @module core/schemas/tenantNumberingConfigSchema
 *
 * One row per entity type per tenant — controls display format, reset
 * strategy, and enable/disable for auto-numbering.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/** @type {import('pg-schemata').TableSchema} */
const tenantNumberingConfigSchema = {
  dbSchema: 'tenantid',
  table: 'tenant_numbering_config',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true, colProps: { cnd: true } },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'id_type', type: 'varchar(32)', notNull: true },
    { name: 'prefix', type: 'varchar(16)', notNull: true, default: '' },
    { name: 'suffix', type: 'varchar(16)', notNull: true, default: '' },
    { name: 'date_mode', type: 'varchar(16)', notNull: true, default: 'none' },
    { name: 'reset_mode', type: 'varchar(16)', notNull: true, default: 'never' },
    { name: 'padding', type: 'integer', notNull: true, default: 4 },
    { name: 'separator', type: 'varchar(4)', notNull: true, default: '-' },
    { name: 'uppercase', type: 'boolean', notNull: true, default: true },
    { name: 'scope_type', type: 'varchar(32)', notNull: true, default: 'none' },
    { name: 'is_enabled', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['tenant_id', 'id_type']],
    checks: [
      {
        type: 'Check',
        expression: "id_type IN ('employee','vendor','client','contact','ar_invoice','ap_invoice','project')",
      },
      { type: 'Check', expression: "date_mode IN ('none','year','year_month','ymd')" },
      { type: 'Check', expression: "reset_mode IN ('never','yearly','monthly','daily')" },
      { type: 'Check', expression: "scope_type IN ('none','legal_entity','company','project')" },
    ],
    indexes: [{ type: 'Index', columns: ['tenant_id', 'id_type'], unique: true }],
  },
};

export default tenantNumberingConfigSchema;
