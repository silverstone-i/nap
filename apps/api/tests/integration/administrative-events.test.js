/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createAdminDatabase,
  using,
} from '../../src/infrastructure/runtime/adminDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateAdmin } from '../../src/application/maintenance/migrateAdmin.js';
import { roleUrl } from '../../src/application/shared/configuration.js';
import { listEvents } from '../../src/modules/admin-tenancy/domain/events.js';

const fixture = process.env.FOUNDATION_TEST_URL;
if (!fixture)
  throw new Error(
    'FOUNDATION_TEST_URL must identify a disposable PostgreSQL 18 server'
  );
const url = new URL(fixture);
const name = 'nap_events_' + randomUUID().replaceAll('-', '');
const config = {
  database: name,
  environment: 'test',
  endpoint: url.host + '/' + name,
  maintenance: url.host + '/postgres',
  adminPassword: 'foundation-admin',
  appPassword: 'foundation-app',
};
let handle, db;

beforeAll(async () => {
  await using(fixture, async tx => {
    for (const [role, password, attrs] of [
      ['nap-admin', config.adminPassword, 'CREATEDB CREATEROLE'],
      ['nap-app', config.appPassword, 'NOCREATEDB NOCREATEROLE'],
    ]) {
      if (
        !(await tx.oneOrNone('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]))
      )
        await tx.none(
          `CREATE ROLE $1:name LOGIN NOSUPERUSER NOBYPASSRLS ${attrs} PASSWORD $2`,
          [role, password]
        );
    }
  });
  await setupLocal(config);
  await migrateAdmin(config);
  handle = createAdminDatabase(
    roleUrl(config.endpoint, 'nap-app', config.appPassword)
  );
  await handle.connect();
  db = handle.db;
}, 30000);

afterAll(async () => {
  await handle?.close();
  await using(fixture, tx =>
    tx.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [name])
  );
});

/**
 * Scope shorthand. `platform` covers every tenant, `support` covers every
 * tenant but its denied ones, and an array names tenants.
 */
function scope(tenantIds, deniedTenantIds = []) {
  return {
    platformPortalUserRead: true,
    tenantIds,
    deniedTenantIds,
    archiveManagement: false,
  };
}

/** Append one event attributed to `actor`, so a test can isolate its own rows. */
function append(actor, overrides = {}, options) {
  return db.managed_events.append(
    {
      deduplication_key: randomUUID(),
      event_key: 'tenant.created',
      outcome: 'succeeded',
      actor_id: actor,
      ...overrides,
    },
    options
  );
}

it('appends an event outside a transaction and reads it back', async () => {
  const actor = randomUUID();
  const tenant = randomUUID();
  const stored = await append(actor, {
    tenant_id: tenant,
    target_type: 'tenant',
    target_id: tenant,
    reason: 'operator request',
    details: { tenant_code: 'ACME', tier: 'standard' },
  });
  expect(stored.id).toEqual(expect.any(String));
  expect(stored.occurred_at).toBeInstanceOf(Date);
  expect(stored.details).toEqual({ tenant_code: 'ACME', tier: 'standard' });

  const page = await listEvents(db, scope('*'), { actor });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0].id).toBe(stored.id);
  expect(page.nextCursor).toBeNull();
});

// AC07. The event and its source row share one transaction, so a rolled-back
// mutation leaves no event claiming it succeeded.
it('rolls the event back with its source transaction', async () => {
  const actor = randomUUID();
  await expect(
    db.tx(async tx => {
      await append(actor, {}, { tx });
      throw new Error('roll back');
    })
  ).rejects.toThrow('roll back');
  expect((await listEvents(db, scope('*'), { actor })).rows).toEqual([]);

  const committed = await db.tx(tx => append(actor, {}, { tx }));
  const page = await listEvents(db, scope('*'), { actor });
  expect(page.rows.map(row => row.id)).toEqual([committed.id]);
});

// AC07. A retried logical operation reuses its deduplication key.
it('returns the existing event for a repeated deduplication key', async () => {
  const actor = randomUUID();
  const event = {
    deduplication_key: randomUUID(),
    event_key: 'cell.registered',
    outcome: 'succeeded',
    actor_id: actor,
    details: { cell_code: 'CELL-1', region: 'us-east' },
  };
  const first = await db.managed_events.append(event);
  const second = await db.managed_events.append(event);
  expect(second.id).toBe(first.id);
  expect(second.occurred_at).toEqual(first.occurred_at);
  expect((await listEvents(db, scope('*'), { actor })).rows).toHaveLength(1);
});

// AC03. The append-only trigger is M0001-00's; this confirms the runtime role
// still cannot reach past it, and that no purge method exists on the model.
it('exposes no runtime update, delete, or purge path', async () => {
  const stored = await append(randomUUID());
  for (const statement of [
    'UPDATE admin.managed_events SET reason=$2 WHERE id=$1',
    'DELETE FROM admin.managed_events WHERE id=$1',
  ])
    await expect(
      db.none(statement, [stored.id, 'edited'])
    ).rejects.toMatchObject({ code: '23514' });
  expect(db.managed_events.purge).toBeUndefined();
});

// AC04. Pagination is stable across pages and never repeats or skips a row.
it('pages newest first without duplicates or gaps', async () => {
  const actor = randomUUID();
  const appended = [];
  for (let index = 0; index < 5; index += 1)
    appended.push(await append(actor, { details: { tier: `t${index}` } }));
  const newestFirst = [...appended].reverse().map(row => row.id);

  const seen = [];
  let cursor;
  do {
    const page = await listEvents(db, scope('*'), { actor, limit: 2, cursor });
    expect(page.rows.length).toBeLessThanOrEqual(2);
    seen.push(...page.rows.map(row => row.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  expect(seen).toEqual(newestFirst);
  expect(new Set(seen).size).toBe(seen.length);
});

// AC04. Every filter narrows the page, and an unauthorized tenant filter is
// indistinguishable from a tenant with no events.
it('filters by tenant, event, outcome, and time range', async () => {
  const actor = randomUUID();
  const tenant = randomUUID();
  const before = new Date();
  await append(actor, { tenant_id: tenant });
  await append(actor, {
    event_key: 'cell.disabled',
    outcome: 'denied',
    reason: 'not permitted',
  });

  const byEvent = await listEvents(db, scope('*'), {
    actor,
    event: 'cell.disabled',
  });
  expect(byEvent.rows.map(row => row.outcome)).toEqual(['denied']);

  const byTenant = await listEvents(db, scope('*'), { actor, tenant });
  expect(byTenant.rows.map(row => row.tenant_id)).toEqual([tenant]);

  const byOutcome = await listEvents(db, scope('*'), {
    actor,
    outcome: 'succeeded',
  });
  expect(byOutcome.rows).toHaveLength(1);

  const inRange = await listEvents(db, scope('*'), {
    actor,
    from: before.toISOString(),
    to: new Date(Date.now() + 60000).toISOString(),
  });
  expect(inRange.rows).toHaveLength(2);

  const beforeRange = await listEvents(db, scope('*'), {
    actor,
    to: before.toISOString(),
  });
  expect(beforeRange.rows).toEqual([]);
});

// AC05 and the PRD's reader-scope table. The null-tenant case is the one the
// filter shape can get wrong: `tenant_id <> $1` is NULL for a null tenant, so
// support must carry an explicit IS NULL branch to keep platform events.
it('applies the reader scope to tenant and null-tenant events', async () => {
  const actor = randomUUID();
  const tenant = randomUUID();
  const napsoft = randomUUID();
  const platformEvent = await append(actor, {
    event_key: 'bootstrap.succeeded',
    details: { step: 'schema' },
  });
  const tenantEvent = await append(actor, { tenant_id: tenant });
  const napsoftEvent = await append(actor, { tenant_id: napsoft });

  const readable = async reader =>
    (await listEvents(db, reader, { actor })).rows.map(row => row.id).sort();

  expect(await readable(scope('*'))).toEqual(
    [platformEvent.id, tenantEvent.id, napsoftEvent.id].sort()
  );
  expect(await readable(scope('*', [napsoft]))).toEqual(
    [platformEvent.id, tenantEvent.id].sort()
  );
  expect(await readable(scope([tenant]))).toEqual([tenantEvent.id]);
  expect(await readable(scope([]))).toEqual([]);

  // A denied tenant filtered explicitly answers exactly as an empty tenant
  // does, so the response cannot confirm that the UUID is a Napsoft tenant.
  const denied = await listEvents(db, scope('*', [napsoft]), {
    actor,
    tenant: napsoft,
  });
  const absent = await listEvents(db, scope('*', [napsoft]), {
    actor,
    tenant: randomUUID(),
  });
  expect(denied).toEqual(absent);
});

// AC05. Support activity keeps both the operator who acted and the tenant user
// whose context was borrowed.
it('retains the real actor and the effective user for support access', async () => {
  const actor = randomUUID();
  const effective = randomUUID();
  const tenant = randomUUID();
  await append(actor, {
    event_key: 'support.entered',
    effective_user_id: effective,
    tenant_id: tenant,
    session_id: randomUUID(),
  });
  const [row] = (await listEvents(db, scope('*'), { actor })).rows;
  expect(row.actor_id).toBe(actor);
  expect(row.effective_user_id).toBe(effective);
});

// AC02 and AC06 at the storage boundary: a rejected event writes nothing.
it('stores nothing for an invalid event', async () => {
  const actor = randomUUID();
  for (const invalid of [
    { event_key: 'tenant.exploded' },
    { outcome: 'pending' },
    { details: { password: 'hunter2' } },
    { event_key: 'bootstrap.succeeded', outcome: 'denied' },
  ])
    await expect(append(actor, invalid)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  expect((await listEvents(db, scope('*'), { actor })).rows).toEqual([]);
});

it('runs every event operation under the nap-app role alone', async () => {
  expect((await db.one('SELECT current_user')).current_user).toBe('nap-app');
});
