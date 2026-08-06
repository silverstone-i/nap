/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface EmailRow extends EntityRow {
  source_id: string;
  email: string;
  label: string | null;
  is_primary: boolean;
  is_login: boolean;
}

/**
 * Canonical email store across all source types; the login email is flagged
 * with `is_login`. Unique per tenant while active.
 */
export const emailsSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'emails',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      default: 'gen_random_uuid()',
      immutable: true,
      colProps: { cnd: true },
    },
    { name: 'source_id', type: 'uuid', notNull: true },
    { name: 'email', type: 'varchar(128)', notNull: true },
    { name: 'label', type: 'varchar(32)' },
    { name: 'is_primary', type: 'boolean', notNull: true, default: false },
    { name: 'is_login', type: 'boolean', notNull: true, default: false },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['source_id'],
        references: { table: 'sources', columns: ['id'] },
        onDelete: 'CASCADE',
      },
    ],
    indexes: [
      { columns: ['email'], unique: true, where: 'deactivated_at IS NULL' },
      { columns: ['source_id'] },
    ],
  },
};

export class Emails extends TableModel<EmailRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, emailsSchema, logger);
  }
}
