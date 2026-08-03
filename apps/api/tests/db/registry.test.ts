/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { RepositoryCtor } from 'pg-schemata';
import { describe, expect, it } from 'vitest';

import {
  collectRepositories,
  moduleRegistry,
  modulesForScope,
} from '../../src/db/index.js';
import type { NapModule, SchemaScope } from '../../src/db/index.js';

class FakeRepo {}

function makeModule(
  name: string,
  schemaScope: SchemaScope,
  models: Record<string, RepositoryCtor>
): NapModule {
  return { name, schemaScope, licensable: false, models, migrations: [] };
}

const admin = makeModule('core-admin', 'admin', { countries: FakeRepo });
const tenant = makeModule('core-tenant', 'tenant', { projects: FakeRepo });

describe('modulesForScope', () => {
  it('returns only modules whose tables live in the given scope', () => {
    const modules = [admin, tenant];

    expect(modulesForScope('admin', modules)).toEqual([admin]);
    expect(modulesForScope('tenant', modules)).toEqual([tenant]);
  });

  it('returns empty for the (currently empty) real registry', () => {
    expect(moduleRegistry).toEqual([]);
    expect(modulesForScope('admin')).toEqual([]);
  });
});

describe('collectRepositories', () => {
  it('flattens every module’s models into one map', () => {
    expect(collectRepositories([admin, tenant])).toEqual({
      countries: FakeRepo,
      projects: FakeRepo,
    });
  });

  it('tolerates a module with no models', () => {
    const bare: NapModule = {
      name: 'bare',
      schemaScope: 'admin',
      licensable: false,
      migrations: [],
    };

    expect(collectRepositories([bare])).toEqual({});
  });

  it('throws when two modules claim the same repository name', () => {
    const rival = makeModule('rival', 'tenant', { countries: FakeRepo });

    expect(() => collectRepositories([admin, rival])).toThrow(
      'Duplicate repository "countries": declared by both "core-admin" and "rival"'
    );
  });
});
