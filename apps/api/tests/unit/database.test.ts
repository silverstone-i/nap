/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it } from 'vitest';
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
      entitlement: 'infrastructure',
      databaseTarget: 'admin',
      schema: 'app',
      migrations: [],
    };
    return [wrongAdmin, wrongCell, wrongModule];
  };
  expect(typeProof).toBeTypeOf('function');
});
it('rejects descriptor mismatch and duplicate names before any migration work', () => {
  const valid: NapModuleDescriptor = {
    name: 'fixture',
    entitlement: 'infrastructure',
    databaseTarget: 'admin',
    schema: 'admin',
    migrations: [],
  };
  expect(() => assertModules('admin', [valid])).not.toThrow();
  expect(() => assertModules('cell', [valid])).toThrow('descriptor');
  expect(() => assertModules('admin', [valid, valid])).toThrow('duplicate');
  // Deliberately bypass static typing to exercise runtime rejection.
  expect(() =>
    assertModules('admin', [
      { ...valid, schema: 'app' } as unknown as NapModuleDescriptor,
    ])
  ).toThrow('descriptor');
});

it.each(['cell', 'reference', 'app', 'reporting'] as const)(
  'accepts the %s cell schema',
  schema => {
    expect(() =>
      assertModules('cell', [
        {
          entitlement: 'infrastructure',
          name: 'fixture',
          databaseTarget: 'cell',
          schema,
          migrations: [],
        },
      ])
    ).not.toThrow();
  }
);

it('rejects an unknown cell schema at runtime', () => {
  // Deliberately bypass static typing to exercise runtime rejection.
  const invalid = {
    name: 'fixture',
    entitlement: 'infrastructure',
    databaseTarget: 'cell',
    schema: 'unknown',
    migrations: [],
  } as unknown as NapModuleDescriptor;
  expect(() => assertModules('cell', [invalid])).toThrow('descriptor');
});
