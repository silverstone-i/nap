'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

/**
 * Table schema definition for the `admin.tenants` table.
 *
 * Stores core tenant-level information including identity, contact info,
 * default settings, and activation status.
 *
 * @type {import('../types').TableSchema}
 */
const tenantSchema = {
  dbSchema: 'admin',
  table: 'tenants',
  hasAuditFields: true,
  version: '0.1.0',
  columns: [
    /**
     * Unique tenant identifier (UUID, immutable).
     */
    {
      name: 'id',
      type: 'uuid',
      default: 'gen_random_uuid()',
      nullable: false,
      immutable: true,
    },

    /**
     * Short unique human-readable code for the tenant (e.g., "nap").
     */
    {
      name: 'tenant_code',
      type: 'varchar',
      length: 6,
      nullable: false,
      unique: true,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Display name for the tenant (must be unique).
     */
    {
      name: 'company',
      type: 'varchar',
      length: 150,
      nullable: false,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Contact email for tenant administration or billing.
     */
    {
      name: 'email',
      type: 'varchar',
      length: 255,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Contact phone number (direct or cell).
     */
    {
      name: 'phone',
      type: 'varchar',
      length: 50,
      default: null,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Structured billing address stored as JSON (street, city, postal, etc.).
     */
    {
      name: 'address',
      type: 'jsonb',
      default: `'{}'`, // empty JSON object by default
      colProps: { mod: ':json', skip: c => !c.exists },
    },

    /**
     * Primary contact person name.
     */
    {
      name: 'contact_name',
      type: 'varchar',
      length: 150,
      nullable: true,
      default: null,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Default time zone for the tenant’s account and reports.
     */
    {
      name: 'timezone',
      type: 'varchar',
      length: 50,
      default: `'UTC'`,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Default currency code for reporting and billing.
     */
    {
      name: 'currency_code',
      type: 'varchar',
      length: 3,
      default: `'USD'`,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Indicates whether the tenant is currently active.
     */
    {
      name: 'is_active',
      type: 'boolean',
      default: 'true',
      nullable: false,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Logical or physical database identifier for this tenant’s data.
     */
    {
      name: 'db_host',
      type: 'varchar',
      length: 100,
      nullable: false,
      default: `'localhost'`,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Tax identification number for billing or regulatory use.
     */
    {
      name: 'tax_id',
      type: 'varchar',
      length: 30,
      nullable: true,
      default: null,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Plan or subscription tier for the tenant (e.g. free, standard, enterprise).
     */
    {
      name: 'plan',
      type: 'varchar',
      length: 50,
      default: `'free'`,
      colProps: { skip: c => !c.exists },
    },

    /**
     * List of enabled module identifiers for this tenant (e.g., accounting, projects).
     */
    {
      name: 'allowed_modules',
      type: 'text[]',
      nullable: false,
      default: `'{}'`, // empty array by default
      colProps: { mod: '^', skip: c => !c.exists },
    },

    /**
     * Optional trial expiration timestamp.
     */
    {
      name: 'trial_expires_at',
      type: 'timestamptz',
      default: `CURRENT_TIMESTAMP + INTERVAL '30 days'`, // 30 days from now
      colProps: { mod: '^', skip: c => !c.exists },
    },
  ],

  constraints: {
    primaryKey: ['id'],
    unique: [['company'], ['tenant_code']],
    checks: [
      {
        type: 'Check',
        expression: `char_length(company) > 2`,
      },
    ],
    indexes: [
    ],
    foreignKeys: [
    ],
  },
};

export default tenantSchema;
