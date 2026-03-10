/**
 * @file Countries schema — ISO 3166-1 alpha-2 reference table (admin scope)
 * @module auth/schemas/countriesSchema
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

const countriesSchema = {
  dbSchema: 'admin',
  table: 'countries',
  version: '1.0.0',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid', nullable: true, default: null } },
  softDelete: false,
  columns: [
    { name: 'id', type: 'uuid', default: 'gen_random_uuid()', notNull: true, immutable: true },
    { name: 'country_code', type: 'char(2)', notNull: true },
    { name: 'name', type: 'varchar(128)', notNull: true },
    { name: 'is_active', type: 'boolean', notNull: true, default: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['country_code']],
    indexes: [
      { type: 'Index', columns: ['country_code'], unique: true },
    ],
  },
};

export default countriesSchema;
