/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The Phase 1 probe table.
 *
 * Deliberately small, and deliberately not a business module: Phase 1 proves
 * the isolation boundary before any tenant business data exists. It is
 * registered only by the isolation suite, so it never reaches the production
 * cell registry or a real cell database.
 *
 * It carries every structural property ADR 0004 requires of a tenant-owned
 * table: an immutable non-null tenant key, a tenant-inclusive candidate key, a
 * tenant-inclusive natural key, and a composite foreign key that includes the
 * tenant.
 */

import { TableModel, defineMigration } from 'pg-schemata';
import type { DbConnection, Logger, Migration, TableSchema } from 'pg-schemata';
import type { IMain } from 'pg-promise';

import type { CellModuleDescriptor } from '../../src/db/cell/moduleRegistry.js';
import { runtimeRole } from '../../src/util/env.js';

/** A probe row. */
export interface IsolationProbeRow {
  id: string;
  tenant_id: string;
  label: string;
  parent_id: string | null;
  note: string | null;
}

/** Schema of `cell.isolation_probe`. */
export const isolationProbeSchema: TableSchema = {
  dbSchema: 'cell',
  table: 'isolation_probe',
  hasAuditFields: false,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    // ARCH-014: non-null and immutable. A row cannot be moved between tenants
    // by updating this column.
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'label', type: 'text', notNull: true },
    { name: 'parent_id', type: 'uuid' },
    { name: 'note', type: 'text' },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [
      // ARCH-015: the tenant-inclusive candidate key composite foreign keys
      // point at, and a tenant-scoped natural key.
      ['tenant_id', 'id'],
      ['tenant_id', 'label'],
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'parent_id'],
        references: {
          schema: 'cell',
          table: 'isolation_probe',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'CASCADE',
      },
    ],
  },
};

/** Repository for the probe table. */
export class IsolationProbe extends TableModel<IsolationProbeRow> {
  constructor(db: DbConnection, pgp: IMain, logger?: Logger | null) {
    super(db, pgp, isolationProbeSchema, logger);
  }
}

/** Name of the policy created for the probe table. */
export const ISOLATION_PROBE_POLICY = 'isolation_probe_tenant_isolation';

const createProbeTable: Migration = defineMigration({
  id: '202608200001-isolation-probe',
  description:
    'Create cell.isolation_probe with forced RLS and runtime-role grants',
  up: async ({ db, models, schema }) => {
    const probe = models.isolationProbe as IsolationProbe;
    await probe.createTable({ tx: db });

    // ARCH-017: enabled *and* forced, so the owning role is subject to the
    // policy too. ENABLE alone exempts the table owner.
    await db.none(
      'ALTER TABLE $1:name.isolation_probe ENABLE ROW LEVEL SECURITY',
      [schema]
    );
    await db.none(
      'ALTER TABLE $1:name.isolation_probe FORCE ROW LEVEL SECURITY',
      [schema]
    );

    // Both expressions are required: USING filters reads and the rows an
    // update or delete can see, WITH CHECK constrains the rows a write may
    // produce.
    //
    // NULLIF is load-bearing. Once a custom GUC has been set on a connection,
    // ending the transaction restores it to the empty string rather than
    // unsetting it, so a pooled connection that previously served a tenant
    // reports '' instead of NULL. Without NULLIF the cast raises 22P02 on
    // exactly the connections that have been used before, which fails closed
    // but turns "no tenant context" into an error instead of an empty result.
    await db.none(
      `CREATE POLICY $1:name ON $2:name.isolation_probe
         USING (
           tenant_id = NULLIF(current_setting('nap.tenant_id', true), '')::uuid
         )
         WITH CHECK (
           tenant_id = NULLIF(current_setting('nap.tenant_id', true), '')::uuid
         )`,
      [ISOLATION_PROBE_POLICY, schema]
    );

    // Grants come last, after the policy exists: the runtime role must never
    // hold privileges on an unprotected table, even briefly.
    const role = runtimeRole('CELL');
    await db.none('GRANT USAGE ON SCHEMA $1:name TO $2:name', [schema, role]);
    await db.none(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON $1:name.isolation_probe TO $2:name',
      [schema, role]
    );
  },
});

const addProbeNote: Migration = defineMigration({
  id: '202608200002-isolation-probe-note',
  description: 'Add the nullable isolation_probe.note column',
  up: async ({ db, schema }) => {
    // ARCH-026 expand step: a nullable column added ahead of any code that
    // writes it, so old and new application versions overlap safely.
    //
    // IF NOT EXISTS because the model above already declares the column, so a
    // database created after this migration was written gets it from
    // createTable. Databases created before it get it here.
    await db.none(
      'ALTER TABLE $1:name.isolation_probe ADD COLUMN IF NOT EXISTS note text',
      [schema]
    );
  },
});

/**
 * The probe's module descriptor, passed to `migrateCell()` by the isolation
 * suite and by nothing else.
 */
export const isolationProbeModule: CellModuleDescriptor = {
  name: 'isolation-probe',
  schema: 'cell',
  models: { isolationProbe: IsolationProbe },
  migrations: [createProbeTable, addProbeNote],
};
