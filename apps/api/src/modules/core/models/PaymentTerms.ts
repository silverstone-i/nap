/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { IMain } from 'pg-promise';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Logger, TableSchema } from 'pg-schemata';
import type { EntityRow } from '../../../db/index.js';

export interface PaymentTermRow extends EntityRow {
  label: string;
  term: number;
  units: string;
  is_active: boolean;
}

/** Net-terms definitions. */
export const paymentTermsSchema: TableSchema = {
  dbSchema: 'tenant',
  table: 'payment_terms',
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
    { name: 'label', type: 'varchar(64)', notNull: true },
    { name: 'term', type: 'integer', notNull: true, default: 30 },
    { name: 'units', type: 'varchar(16)', notNull: true, default: 'days' },
    { name: 'is_active', type: 'boolean', notNull: true, default: true },
  ],
  constraints: {
    primaryKey: ['id'],
  },
};

export class PaymentTerms extends TableModel<PaymentTermRow> {
  constructor(db: DbConnection, pgp: IMain, logger: Logger | null = null) {
    super(db, pgp, paymentTermsSchema, logger);
  }
}
