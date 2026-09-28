/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { cellToAdmin } from '../../src/application/sync/directions.js';
import { supersede } from '../../src/application/sync/engine.js';
import { parseSnapshot } from '../../src/application/sync/snapshots.js';
import { roleChangeRecorder } from '../../src/modules/access-control/domain/events.js';

const TENANT = randomUUID();
const CELL = randomUUID();
const ACTOR = randomUUID();
const ROLE = randomUUID();

const change = {
  eventKey: 'role.granted',
  roleId: ROLE,
  details: {
    role: 'clerk',
    portal_user_id: randomUUID(),
    from_status: 'unassigned',
    to_status: 'assigned',
  },
};

/** Record one change and return the outbox row it wrote. */
async function recordedRow() {
  const insert = vi.fn(async () => {});
  const tx = {};
  await roleChangeRecorder(
    { outbox: { insert } },
    { tenantId: TENANT, actorId: ACTOR }
  )(change, tx);
  expect(insert.mock.calls[0][1]).toEqual({ tx });
  return {
    id: randomUUID(),
    attempts: 0,
    created_at: new Date(),
    ...insert.mock.calls[0][0],
  };
}

/** An admin handle recording appended events and advanced revisions. */
function fakeAdmin() {
  const events = new Map();
  const advanced = [];
  return {
    events,
    advanced,
    tx: async operation => operation({}),
    tenants: { cellOf: async () => CELL },
    managed_events: {
      hasDeduplicationKey: async key => events.has(key),
      append: async event => {
        if (!events.has(event.deduplication_key))
          events.set(event.deduplication_key, event);
      },
    },
    cache_revisions: {
      advance: async keys => advanced.push(...keys),
    },
  };
}

describe('roleChangeRecorder (M0003-R015)', () => {
  it('writes one role_change outbox row per change inside the caller transaction', async () => {
    const first = await recordedRow();
    const second = await recordedRow();
    expect(first).toMatchObject({
      tenant_id: TENANT,
      topic: 'role_change',
      revision: 1,
      payload: {
        tenant_id: TENANT,
        event_key: 'role.granted',
        role_id: ROLE,
        actor_id: ACTOR,
        session_id: null,
        request_id: null,
        details: change.details,
      },
    });
    expect(parseSnapshot('role_change', first.payload)).not.toBeNull();
    expect(first.entity_id).not.toBe(second.entity_id);
    expect(supersede([first, second]).live).toHaveLength(2);
  });

  it('rejects a payload with an unknown event key or extra field', async () => {
    const { payload } = await recordedRow();
    expect(
      parseSnapshot('role_change', { ...payload, event_key: 'tenant.created' })
    ).toBeNull();
    expect(parseSnapshot('role_change', { ...payload, extra: 1 })).toBeNull();
  });
});

describe('cellToAdmin role_change delivery (M0003-R015)', () => {
  it('writes the event and advances the roles revision once, even when redelivered', async () => {
    const row = await recordedRow();
    const admin = fakeAdmin();
    const apply = cellToAdmin({ admin, cellId: CELL, tenantId: TENANT });
    expect(await apply([row])).toEqual({ delivered: [row.id], failed: [] });
    expect(await apply([row])).toEqual({ delivered: [row.id], failed: [] });
    expect([...admin.events.values()]).toEqual([
      expect.objectContaining({
        deduplication_key: row.entity_id,
        event_key: 'role.granted',
        outcome: 'succeeded',
        actor_id: ACTOR,
        tenant_id: TENANT,
        target_type: 'role',
        target_id: ROLE,
        details: {
          ...change.details,
          changed_at: row.created_at.toISOString(),
        },
      }),
    ]);
    expect(admin.advanced).toEqual([{ domain: 'roles', entity: TENANT }]);
  });

  it('fails a row naming another tenant without advancing the revision', async () => {
    const row = await recordedRow();
    row.payload = { ...row.payload, tenant_id: randomUUID() };
    const admin = fakeAdmin();
    const result = await cellToAdmin({ admin, cellId: CELL, tenantId: TENANT })(
      [row]
    );
    expect(result).toEqual({
      delivered: [],
      failed: [{ id: row.id, code: 'TENANT_MISMATCH' }],
    });
    expect([...admin.events.values()]).toEqual([
      expect.objectContaining({
        event_key: 'sync.delivery.failed',
        details: {
          direction: 'cell_to_admin',
          failure_code: 'TENANT_MISMATCH',
          attempts: 1,
        },
      }),
    ]);
    expect(admin.advanced).toEqual([]);
  });
});
