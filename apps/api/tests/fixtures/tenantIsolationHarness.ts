/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The shared tenant-isolation suite.
 *
 * Every tenant-aware module registers this suite for its own tables
 * (RULES/database-access.md). It runs as the real runtime role, uses the same
 * `withTenantTransaction()` entry point as HTTP requests (ARCH-020), and
 * covers the deliberate cross-tenant attempts ARCH-033 requires plus operation
 * with no tenant context and with an invalid one.
 *
 * The attempts are made with application predicates deliberately omitted, so a
 * pass means RLS and the composite constraints are doing the work.
 */

import { randomUUID } from 'node:crypto';
import { beforeAll, expect, it } from 'vitest';

import type { CellDatabase } from '../../src/db/cell/createCellDb.js';
import type { CellTransaction } from '../../src/db/cell/withTenantTransaction.js';
import {
  TenantContextError,
  withTenantTransaction,
} from '../../src/db/cell/withTenantTransaction.js';

/** Values a target's row insert accepts. */
export interface IsolationRowInput {
  /** Tenant key written into the row. */
  tenantId: string;
  /** Value for the target's natural-key column. */
  label: string;
  /** Value for the composite-foreign-key column, when the target has one. */
  parentId?: string | null;
}

/** Describes one tenant-owned table to the suite. */
export interface TenantIsolationTarget {
  /** Physical schema holding the table. */
  schema: string;
  /** Table name. */
  table: string;
  /** Column carrying the tenant key. Defaults to `tenant_id`. */
  tenantColumn?: string;
  /** Primary-key column. Defaults to `id`. */
  identityColumn?: string;
  /** A column the suite may freely update. */
  mutableColumn: string;
  /** Composite-foreign-key column, when the table has one. */
  parentColumn?: string;
  /**
   * Inserts one row through the module's own repository path.
   *
   * @param tx - Active tenant transaction.
   * @param row - Row values.
   * @returns The new row's identity value.
   */
  insertRow(tx: CellTransaction, row: IsolationRowInput): Promise<string>;
}

/** Options accepted by {@link registerTenantIsolationTests}. */
export interface TenantIsolationOptions {
  /** Resolves the cell handle, connected as the runtime role. */
  cellDb: () => CellDatabase;
  /** The tenant the suite acts as. */
  tenantA: () => string;
  /** A second tenant whose rows must stay invisible and untouchable. */
  tenantB: () => string;
  /** The table under test. */
  target: TenantIsolationTarget;
}

/** PostgreSQL error codes the suite asserts on. */
const INSUFFICIENT_PRIVILEGE = '42501';
const FOREIGN_KEY_VIOLATION = '23503';
const INVALID_TEXT_REPRESENTATION = '22P02';

/**
 * Reads the SQLSTATE from a caught error.
 *
 * @param error - The rejection value.
 * @returns The code, or undefined when the error carries none.
 */
function sqlState(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : undefined;
}

/**
 * Registers the isolation tests inside the caller's `describe` block.
 *
 * @param options - Handle, tenants, and target table.
 */
export function registerTenantIsolationTests(
  options: TenantIsolationOptions
): void {
  const { target } = options;
  const tenantColumn = target.tenantColumn ?? 'tenant_id';
  const identityColumn = target.identityColumn ?? 'id';
  /**
   * Builds a statement against the target table.
   *
   * @param sql - SQL with `$/table/` standing in for the qualified table.
   * @returns The statement with the table name interpolated and escaped.
   */
  const statement = (sql: string): string =>
    sql.replaceAll('$/table/', `"${target.schema}"."${target.table}"`);

  let rowA = '';
  let rowB = '';

  beforeAll(async () => {
    rowA = await withTenantTransaction(
      options.cellDb(),
      options.tenantA(),
      tx =>
        target.insertRow(tx, {
          tenantId: options.tenantA(),
          label: `a-${randomUUID()}`,
        })
    );

    rowB = await withTenantTransaction(
      options.cellDb(),
      options.tenantB(),
      tx =>
        target.insertRow(tx, {
          tenantId: options.tenantB(),
          label: `b-${randomUUID()}`,
        })
    );
  });

  it('reads only the active tenant rows', async () => {
    const rows = await withTenantTransaction(
      options.cellDb(),
      options.tenantA(),
      // No tenant predicate: the policy is the only thing filtering.
      tx => tx.any<Record<string, string>>(statement('SELECT * FROM $/table/'))
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(row => row[tenantColumn] === options.tenantA())).toBe(
      true
    );
    expect(rows.some(row => row[identityColumn] === rowB)).toBe(false);
  });

  it('cannot read another tenant row by its identifier', async () => {
    const found = await withTenantTransaction(
      options.cellDb(),
      options.tenantA(),
      tx =>
        tx.oneOrNone<unknown>(
          statement(`SELECT * FROM $/table/ WHERE "${identityColumn}" = $1`),
          [rowB]
        )
    );

    expect(found).toBeNull();
  });

  it('cannot insert a row carrying another tenant key', async () => {
    const attempt = withTenantTransaction(
      options.cellDb(),
      options.tenantA(),
      tx =>
        target.insertRow(tx, {
          tenantId: options.tenantB(),
          label: `forged-${randomUUID()}`,
        })
    );

    await expect(attempt).rejects.toSatisfy(
      (error: unknown) => sqlState(error) === INSUFFICIENT_PRIVILEGE
    );
  });

  it('cannot update another tenant row', async () => {
    const changed = await withTenantTransaction(
      options.cellDb(),
      options.tenantA(),
      tx =>
        tx.result(
          statement(
            `UPDATE $/table/ SET "${target.mutableColumn}" = $1
              WHERE "${identityColumn}" = $2`
          ),
          [`hijacked-${randomUUID()}`, rowB],
          result => result.rowCount
        )
    );

    expect(changed).toBe(0);
  });

  it('cannot move its own row to another tenant', async () => {
    const attempt = withTenantTransaction(
      options.cellDb(),
      options.tenantA(),
      tx =>
        tx.none(
          statement(
            `UPDATE $/table/ SET "${tenantColumn}" = $1
              WHERE "${identityColumn}" = $2`
          ),
          [options.tenantB(), rowA]
        )
    );

    await expect(attempt).rejects.toSatisfy(
      (error: unknown) => sqlState(error) === INSUFFICIENT_PRIVILEGE
    );
  });

  it('cannot delete another tenant row', async () => {
    const deleted = await withTenantTransaction(
      options.cellDb(),
      options.tenantA(),
      tx =>
        tx.result(
          statement(`DELETE FROM $/table/ WHERE "${identityColumn}" = $1`),
          [rowB],
          result => result.rowCount
        )
    );

    expect(deleted).toBe(0);

    // The row is still there for its owner: nothing was silently destroyed.
    const survivor = await withTenantTransaction(
      options.cellDb(),
      options.tenantB(),
      tx =>
        tx.oneOrNone<unknown>(
          statement(`SELECT * FROM $/table/ WHERE "${identityColumn}" = $1`),
          [rowB]
        )
    );

    expect(survivor).not.toBeNull();
  });

  if (target.parentColumn) {
    it('cannot reference another tenant row', async () => {
      const attempt = withTenantTransaction(
        options.cellDb(),
        options.tenantA(),
        tx =>
          target.insertRow(tx, {
            tenantId: options.tenantA(),
            label: `child-${randomUUID()}`,
            parentId: rowB,
          })
      );

      // The composite foreign key includes the tenant, so this fails as a key
      // violation even though RLS would also have hidden the parent.
      await expect(attempt).rejects.toSatisfy(
        (error: unknown) => sqlState(error) === FOREIGN_KEY_VIOLATION
      );
    });
  }

  it('reads nothing with no tenant context', async () => {
    const rows = await options
      .cellDb()
      .tx(tx => tx.any(statement('SELECT * FROM $/table/')));

    expect(rows).toEqual([]);
  });

  it('writes nothing with no tenant context', async () => {
    const attempt = options.cellDb().tx(tx =>
      target.insertRow(tx, {
        tenantId: options.tenantA(),
        label: `contextless-${randomUUID()}`,
      })
    );

    await expect(attempt).rejects.toSatisfy(
      (error: unknown) => sqlState(error) === INSUFFICIENT_PRIVILEGE
    );
  });

  it('rejects a non-UUID tenant before reaching the database', async () => {
    let ran = false;

    const attempt = withTenantTransaction(
      options.cellDb(),
      "not-a-uuid'; --",
      () => {
        ran = true;
        return Promise.resolve(null);
      }
    );

    await expect(attempt).rejects.toBeInstanceOf(TenantContextError);
    expect(ran).toBe(false);
  });

  it('fails closed when the tenant context is not a UUID', async () => {
    const attempt = options.cellDb().tx(async tx => {
      await tx.one('SELECT set_config($1, $2, true)', [
        'nap.tenant_id',
        'not-a-uuid',
      ]);
      return tx.any(statement('SELECT * FROM $/table/'));
    });

    await expect(attempt).rejects.toSatisfy(
      (error: unknown) => sqlState(error) === INVALID_TEXT_REPRESENTATION
    );
  });

  it('cannot disable row-level security as the runtime role', async () => {
    const attempt = options
      .cellDb()
      .tx(tx =>
        tx.none(statement('ALTER TABLE $/table/ DISABLE ROW LEVEL SECURITY'))
      );

    await expect(attempt).rejects.toSatisfy(
      (error: unknown) => sqlState(error) === INSUFFICIENT_PRIVILEGE
    );
  });

  it('cannot drop the isolation policy as the runtime role', async () => {
    const attempt = options
      .cellDb()
      .tx(tx =>
        tx.none(statement('ALTER TABLE $/table/ NO FORCE ROW LEVEL SECURITY'))
      );

    await expect(attempt).rejects.toSatisfy(
      (error: unknown) => sqlState(error) === INSUFFICIENT_PRIVILEGE
    );
  });
}
