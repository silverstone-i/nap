/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { QueryModel } from 'pg-schemata';
import { describe, expect, it } from 'vitest';

import {
  collectRepositories,
  initDb,
  moduleRegistry,
} from '../../src/db/index.js';

// pg-promise connects lazily, so initDb() against this URL never opens a
// socket. DB.init's extend hook instantiates every registered model, which
// runs pg-schemata's schema validation over all of them — this file is the
// no-database proof that every table model in the registry is well-formed.
// It calls initDb, so per the singleton rule it lives in its own file.
const FAKE_URL = 'postgres://nap:never@localhost:5432/never_connected';

describe('module registry models', () => {
  const handle = initDb(FAKE_URL);

  it('attaches every registered repository to the db handle', () => {
    const repositories = handle as unknown as Record<string, unknown>;

    for (const name of Object.keys(collectRepositories(moduleRegistry))) {
      expect(repositories[name], name).toBeInstanceOf(QueryModel);
    }
  });

  it('binds admin-scope models to the admin schema', () => {
    expect(handle.tenants.schema.dbSchema).toBe('admin');
    expect(handle.tenants.schema.table).toBe('tenants');
    expect(handle.portalUsers.schema.dbSchema).toBe('admin');
    expect(handle.portalUserTenants.schema.table).toBe('portal_user_tenants');
    expect(handle.countries.schema.dbSchema).toBe('admin');
  });

  it('gives tenant-scope models the inert placeholder schema', () => {
    expect(handle.roles.schema.dbSchema).toBe('tenant');
    expect(handle.employees.schema.dbSchema).toBe('tenant');
    expect(handle.tenantNumberSequenceState.schema.table).toBe(
      'tenant_number_sequence_state'
    );
  });

  it('forSchema() rebinds a tenant model without mutating the original', () => {
    const rebound = handle.employees.forSchema('acme');

    expect(rebound.schema.dbSchema).toBe('acme');
    expect(rebound.schema.table).toBe('employees');
    expect(handle.employees.schema.dbSchema).toBe('tenant');
  });
});
