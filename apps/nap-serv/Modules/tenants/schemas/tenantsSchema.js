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
  softDelete: true,
  version: '0.1.0',

  columns: [
    /**
     * Unique tenant identifier (UUID, immutable).
     */
    {
      name: 'id',
      type: 'uuid',
      default: 'gen_random_uuid()',
      notNull: true,
      immutable: true,
    },

    /**
     * Short unique human-readable code for the tenant (e.g., "nap").
     */
    {
      name: 'tenant_code',
      type: 'varchar(6)',
      notNull: true,
      unique: true,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Display name for the tenant (must be unique).
     */
    {
      name: 'company',
      type: 'varchar(150)',
      notNull: true,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Contact email for tenant administration or billing.
     */
    {
      name: 'email',
      type: 'varchar(255)',
      colProps: { skip: c => !c.exists },
    },

    /**
     * Contact phone number (direct or cell).
     */
    {
      name: 'phone',
      type: 'varchar(50)',
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
      type: 'varchar(150)',
      default: null,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Default time zone for the tenant’s account and reports.
     */
    {
      name: 'time_zone',
      type: 'varchar(50)',
      default: `'EST'`,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Default currency code for reporting and billing.
     */
    {
      name: 'currency_code',
      type: 'varchar(5)',
      default: `'USD'`,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Logical or physical database identifier for this tenant’s data.
     */
    {
      name: 'db_host',
      type: 'varchar(100)',
      notNull: true,
      default: `'localhost'`,
      colProps: { skip: c => !c.exists },
    },

    /**
     * Tax identification number for billing or regulatory use.
     */
    {
      name: 'tax_id',
      type: 'varchar(30)',
      default: null,
      colProps: { skip: c => !c.exists },
    },

    /**
     * List of enabled module identifiers for this tenant (e.g., accounting, projects).
     */
    {
      name: 'allowed_modules',
      type: 'text[]',
      notNull: true,
      default: `'{}'`, // empty array by default
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
  },
};

export default tenantSchema;
