/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it } from 'vitest';
import {
  resolveEnvironment,
  resolveRuntimeConfiguration,
  resolveMigrationConfiguration,
} from '../../src/util/env.js';
import { assertModules } from '../../src/db/modules.js';
import type { NapModuleDescriptor } from '../../src/db/modules.js';
import type { AdminDatabase } from '../../src/db/admin/index.js';
import type { CellDatabase } from '../../src/db/cell/index.js';

it('keeps admin and cell handle types and module targets distinct', () => {
  // This function is typechecked but never called with invented handles.
  const typeProof = (admin: AdminDatabase, cell: CellDatabase) => {
    // @ts-expect-error Cell handle cannot satisfy admin identity.
    const wrongAdmin: AdminDatabase = cell;
    // @ts-expect-error Admin handle cannot satisfy cell identity.
    const wrongCell: CellDatabase = admin;
    // @ts-expect-error Admin modules cannot target a cell schema.
    const wrongModule: NapModuleDescriptor = {
      name: 'bad',
      databaseTarget: 'admin',
      schema: 'app',
      migrations: [],
    };
    return [wrongAdmin, wrongCell, wrongModule];
  };
  expect(typeProof).toBeTypeOf('function');
});
it('selects environments and requires only the credentials for the operation', () => {
  expect(resolveEnvironment({})).toBe('DEV');
  expect(resolveEnvironment({ NODE_ENV: 'test' })).toBe('TEST');
  expect(resolveEnvironment({ NODE_ENV: 'production' })).toBe('PROD');
  expect(() => resolveEnvironment({ NODE_ENV: '' })).toThrow('NODE_ENV');
  const admin =
    'postgres://app:secret@localhost/admin?sslmode=require&application_name=nap';
  const cell = 'postgres://app:secret@localhost/cell';
  expect(
    resolveRuntimeConfiguration({
      ADMIN_DATABASE_URL_DEV: admin,
      CELL_DATABASE_URL_DEV: cell,
    })
  ).toEqual({ admin, cell });
  expect(
    resolveMigrationConfiguration('cell', {
      NODE_ENV: 'production',
      CELL_MIGRATION_URL_PROD: cell,
    })
  ).toBe(cell);
});
it('rejects overlapping endpoints, target overrides, missing and malformed credentials without disclosure', () => {
  expect(() =>
    resolveRuntimeConfiguration({
      ADMIN_DATABASE_URL_DEV: 'postgres://a:x@LOCALHOST/admin',
      CELL_DATABASE_URL_DEV: 'postgresql://b:y@localhost:5432/%61dmin',
    })
  ).toThrow('distinct');
  for (const value of [
    '',
    'private-value',
    'postgres://a:secret@localhost/admin?host=elsewhere',
    'postgres://a:secret@localhost/admin?options=-crole=owner',
  ]) {
    expect(() =>
      resolveMigrationConfiguration('admin', { ADMIN_MIGRATION_URL_DEV: value })
    ).toThrow('Invalid database configuration: ADMIN_MIGRATION_URL_DEV');
  }
});
it('rejects descriptor mismatch and duplicate names before any migration work', () => {
  const valid: NapModuleDescriptor = {
    name: 'fixture',
    databaseTarget: 'admin',
    schema: 'admin',
    migrations: [],
  };
  expect(() => assertModules('admin', [valid])).not.toThrow();
  expect(() => assertModules('cell', [valid])).toThrow('descriptor');
  expect(() => assertModules('admin', [valid, valid])).toThrow('duplicate');
  expect(() =>
    assertModules('admin', [
      { ...valid, schema: 'app' } as unknown as NapModuleDescriptor,
    ])
  ).toThrow('descriptor');
});
