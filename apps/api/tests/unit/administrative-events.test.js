/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';
import {
  EVENT_CATALOGUE,
  EVENT_DETAIL_KEYS,
  EVENT_OUTCOMES,
  EVENT_VIEW_COLUMNS,
  eventScopeFilter,
  listEvents,
  parseDetails,
  parseEvent,
} from '../../src/modules/admin-tenancy/domain/events.js';
import {
  encodeEventCursor,
  parseEventCursor,
} from '../../src/modules/admin-tenancy/domain/cursor.js';
import { ManagedEvents } from '../../src/modules/admin-tenancy/models/managed_events.js';

const dedup = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const tenant = '33333333-3333-4333-8333-333333333333';
const napsoft = '44444444-4444-4444-8444-444444444444';
const fingerprint = 'a'.repeat(64);

/** A minimal valid event; `overrides` replaces or adds fields. */
function event(overrides = {}) {
  return {
    deduplication_key: dedup,
    event_key: 'tenant.created',
    outcome: 'succeeded',
    ...overrides,
  };
}

/** Scope shorthand: platform, support, a named tenant, or nothing. */
function scope(tenantIds, deniedTenantIds = []) {
  return {
    platformPortalUserRead: true,
    tenantIds,
    deniedTenantIds,
    archiveManagement: false,
  };
}

function reader({ rows = [], nextCursor = null, failure } = {}) {
  const page = vi.fn(async () => {
    if (failure) throw failure;
    return { rows, nextCursor };
  });
  return { db: { managed_events: { page } }, page };
}

/** A position at the microsecond precision the model reads back. */
const position = { occurred_at: '2026-09-19T10:00:00.123456Z', id: dedup };

function model({ inserted = null, existing = null, failure } = {}) {
  const oneOrNone = vi.fn(async () => {
    if (failure) throw failure;
    return inserted;
  });
  const one = vi.fn(async () => existing);
  const db = { oneOrNone, one };
  // `append` writes raw SQL, so pg-promise is needed only to build the
  // constructor's ColumnSet and to quote the two identifiers.
  const pgp = {
    helpers: { ColumnSet: class {} },
    as: { name: identifier => `"${identifier}"` },
  };
  return { model: new ManagedEvents(db, pgp, undefined), oneOrNone, one, db };
}

describe('catalogue', () => {
  it('names every key in the PRD areas with permitted outcomes', () => {
    expect(Object.keys(EVENT_CATALOGUE)).toHaveLength(39);
    for (const [key, entry] of Object.entries(EVENT_CATALOGUE)) {
      expect(entry.outcomes.length, key).toBeGreaterThan(0);
      for (const outcome of entry.outcomes)
        expect(EVENT_OUTCOMES, key).toContain(outcome);
    }
  });

  it.each([
    ['bootstrap.succeeded', 'succeeded'],
    ['bootstrap.failed', 'failed'],
    ['auth.login.throttled', 'denied'],
    ['support.denied', 'denied'],
    ['cell.provisioning.completed', 'succeeded'],
    ['cache.revision.failed', 'failed'],
  ])('pins %s to the outcome its name states', (key, outcome) => {
    expect(EVENT_CATALOGUE[key].outcomes).toEqual([outcome]);
  });

  it('draws every detail allowlist from the shared vocabulary', () => {
    for (const [key, entry] of Object.entries(EVENT_CATALOGUE))
      for (const detail of entry.details)
        expect(EVENT_DETAIL_KEYS, key).toContain(detail);
  });

  // M0001-12-R007 / AC06. Asserted over the vocabulary rather than one event,
  // so a later Work Unit cannot add a leaking allowlist entry unnoticed.
  it('admits no detail key that could name a secret', () => {
    const forbidden =
      /password|hash|token|secret|connection|credential|cookie|api_?key|private_?key/i;
    for (const detail of EVENT_DETAIL_KEYS)
      expect(forbidden.test(detail), detail).toBe(false);
    expect(EVENT_VIEW_COLUMNS).not.toContain('password_hash');
  });
});

describe('parseEvent', () => {
  it('normalizes absent attribution to null and absent details to an empty object', () => {
    expect(parseEvent(event({ tenant_id: tenant }))).toEqual({
      deduplication_key: dedup,
      event_key: 'tenant.created',
      outcome: 'succeeded',
      request_id: null,
      actor_id: null,
      effective_user_id: null,
      tenant_id: tenant,
      target_type: null,
      target_id: null,
      session_id: null,
      reason: null,
      details: {},
    });
  });

  it('retains the real actor and the effective user together', () => {
    const parsed = parseEvent(
      event({
        event_key: 'support.entered',
        actor_id: actor,
        effective_user_id: napsoft,
        tenant_id: tenant,
      })
    );
    expect(parsed.actor_id).toBe(actor);
    expect(parsed.effective_user_id).toBe(napsoft);
  });

  // AC02.
  it.each([
    ['an unknown key', { event_key: 'tenant.exploded' }],
    ['a key the catalogue omits', { event_key: 'constructor' }],
    [
      'an outcome the key forbids',
      { event_key: 'bootstrap.succeeded', outcome: 'failed' },
    ],
    ['an outcome outside the check constraint', { outcome: 'pending' }],
    ['a malformed deduplication key', { deduplication_key: 'not-a-uuid' }],
    ['a malformed actor', { actor_id: 'not-a-uuid' }],
    ['a malformed tenant', { tenant_id: '' }],
    ['an over-length target type', { target_type: 'x'.repeat(65) }],
    ['an over-length reason', { reason: 'x'.repeat(513) }],
    ['an unlisted column', { occurred_at: '2026-09-19T00:00:00.000Z' }],
    ['an unlisted detail key', { details: { password: 'hunter2' } }],
    ['a detail key from another event', { details: { role: 'admin' } }],
    ['a nested detail value', { details: { tier: { secret: 'x' } } }],
    ['an array detail value', { details: { tier: ['secret'] } }],
    ['an array for details', { details: ['tier'] }],
    ['an over-length detail string', { details: { tier: 'x'.repeat(257) } }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => parseEvent(event(overrides))).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' })
    );
  });

  it('accepts the permitted detail value shapes', () => {
    const parsed = parseEvent(
      event({
        event_key: 'cell.provisioning.failed',
        outcome: 'failed',
        details: { step: 'render', code: 'TIMEOUT', attempt: 3 },
      })
    );
    expect(parsed.details).toEqual({
      step: 'render',
      code: 'TIMEOUT',
      attempt: 3,
    });
  });

  it('treats absent and null details alike', () => {
    expect(parseDetails('tenant.created', null)).toEqual({});
    expect(parseDetails('tenant.created', undefined)).toEqual({});
  });
});

describe('eventScopeFilter', () => {
  it('restricts nothing for a scope covering every tenant', () => {
    expect(eventScopeFilter(scope('*'))).toEqual([]);
  });

  // The NULL branch is the point: `tenant_id <> $1` is NULL, not true, for a
  // null tenant, so support would silently lose every platform event without it.
  it('keeps null-tenant events readable for a scope with denied tenants', () => {
    expect(eventScopeFilter(scope('*', [napsoft]))).toEqual([
      {
        $or: [
          { tenant_id: { $is: null } },
          { $and: [{ tenant_id: { $ne: napsoft } }] },
        ],
      },
    ]);
  });

  it('excludes null-tenant events from a named-tenant scope', () => {
    expect(eventScopeFilter(scope([tenant]))).toEqual([
      { tenant_id: { $in: [tenant] } },
    ]);
  });

  it('drops a named tenant that is also denied', () => {
    expect(eventScopeFilter(scope([tenant, napsoft], [napsoft]))).toEqual([
      { tenant_id: { $in: [tenant] } },
    ]);
  });

  it('permits nothing when every named tenant is denied', () => {
    expect(eventScopeFilter(scope([napsoft], [napsoft]))).toBeNull();
    expect(eventScopeFilter(scope([]))).toBeNull();
  });
});

describe('listEvents', () => {
  it('applies the default page limit and starts without a position', async () => {
    const { db, page } = reader();
    await listEvents(db, scope('*'), {});
    expect(page.mock.calls[0].slice(1)).toEqual([50, null]);
  });

  it('combines scope and request filters instead of overwriting the scope', async () => {
    const { db, page } = reader();
    await listEvents(db, scope([tenant]), {
      tenant,
      actor,
      event: 'tenant.created',
      outcome: 'succeeded',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T00:00:00.000Z',
    });
    expect(page.mock.calls[0][0]).toEqual([
      { tenant_id: { $in: [tenant] } },
      { tenant_id: { $eq: tenant } },
      { actor_id: { $eq: actor } },
      { event_key: { $eq: 'tenant.created' } },
      { outcome: { $eq: 'succeeded' } },
      {
        occurred_at: {
          $from: '2026-09-01T00:00:00.000Z',
          $to: '2026-09-30T00:00:00.000Z',
        },
      },
    ]);
  });

  // AC05. An empty page rather than FORBIDDEN, so a support caller cannot use
  // the response to confirm that a UUID names a Napsoft tenant.
  it('returns an empty page without querying for a tenant outside the scope', async () => {
    const { db, page } = reader();
    expect(
      await listEvents(db, scope('*', [napsoft]), { tenant: napsoft })
    ).toEqual({ rows: [], nextCursor: null });
    expect(await listEvents(db, scope([tenant]), { tenant: napsoft })).toEqual({
      rows: [],
      nextCursor: null,
    });
    expect(page).not.toHaveBeenCalled();
  });

  it('returns an empty page without querying for a scope permitting nothing', async () => {
    const { db, page } = reader();
    expect(await listEvents(db, scope([]), {})).toEqual({
      rows: [],
      nextCursor: null,
    });
    expect(page).not.toHaveBeenCalled();
  });

  // The position must survive the round trip at microsecond precision: a
  // millisecond cursor would skip every row inside the truncated remainder.
  it('issues an opaque cursor that resumes at the exact stored position', async () => {
    const { db } = reader({ rows: [{ id: dedup }], nextCursor: position });
    const first = await listEvents(db, scope('*'), {});
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(first.nextCursor).not.toContain(dedup);

    const resumed = reader();
    await listEvents(resumed.db, scope('*'), { cursor: first.nextCursor });
    expect(resumed.page.mock.calls[0][2]).toEqual(position);
  });

  // AC04. A cursor carries the filters it was issued under, so a caller cannot
  // page into events the first request was not authorized to see.
  it.each([
    ['a widened filter', scope('*'), { outcome: 'failed' }],
    ['a different scope', scope([tenant]), {}],
  ])('rejects a cursor replayed with %s', async (_label, other, filters) => {
    const { db } = reader({ rows: [{ id: dedup }], nextCursor: position });
    const first = await listEvents(db, scope('*'), { outcome: 'succeeded' });
    await expect(
      listEvents(db, other, { ...filters, cursor: first.nextCursor })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it.each([
    ['an unknown event key', { event: 'tenant.exploded' }],
    ['an outcome outside the catalogue', { outcome: 'pending' }],
    ['a limit above the maximum', { limit: 101 }],
    ['a limit below one', { limit: 0 }],
    ['a non-integer limit', { limit: 2.5 }],
    [
      'a reversed date range',
      { from: '2026-09-30T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' },
    ],
    [
      'a range reversed only once its offsets are applied',
      { from: '2026-09-19T00:00:00-10:00', to: '2026-09-19T05:00:00Z' },
    ],
    ['a malformed timestamp', { from: '2026-09-30' }],
    ['a malformed cursor', { cursor: 'not-base64url-json' }],
    ['an unknown filter', { napsoft: true }],
  ])('rejects %s', async (_label, filters) => {
    const { db } = reader();
    await expect(listEvents(db, scope('*'), filters)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  // The bounds are instants, not text: this range runs 18:00Z to 20:00Z, but
  // sorts backwards when the two strings are compared directly.
  it('accepts a range whose offsets sort against its chronology', async () => {
    const { db, page } = reader();
    await listEvents(db, scope('*'), {
      from: '2026-09-19T23:00:00+05:00',
      to: '2026-09-19T20:00:00Z',
    });
    expect(page.mock.calls[0][0]).toEqual([
      {
        occurred_at: {
          $from: '2026-09-19T23:00:00+05:00',
          $to: '2026-09-19T20:00:00Z',
        },
      },
    ]);
  });

  it.each([
    ['a serialization failure', { code: '40001' }, 'CONFLICT'],
    ['a deadlock', { code: '40P01' }, 'CONFLICT'],
    [
      'any other driver error',
      {
        code: '42P01',
        message: 'relation admin.managed_events does not exist',
      },
      'INTERNAL_ERROR',
    ],
  ])('reports %s without database detail', async (_label, failure, code) => {
    const { db } = reader({ failure });
    await expect(listEvents(db, scope('*'), {})).rejects.toMatchObject({
      code,
    });
    await expect(listEvents(db, scope('*'), {})).rejects.not.toMatchObject({
      message: expect.stringContaining('managed_events'),
    });
  });
});

describe('append', () => {
  it('inserts the supplied columns and never occurred_at or id', async () => {
    const stored = { id: dedup };
    const { model: events, oneOrNone } = model({ inserted: stored });
    expect(await events.append(event({ tenant_id: tenant }))).toBe(stored);
    const [sql, values] = oneOrNone.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (deduplication_key) DO NOTHING');
    expect(sql).not.toContain('DO UPDATE');
    expect(sql).not.toMatch(/INSERT INTO[^(]*\([^)]*\boccurred_at\b/);
    expect(sql).not.toMatch(/INSERT INTO[^(]*\([^)]*\bid\b/);
    expect(values[0]).toBe(dedup);
    expect(values.at(-1)).toBe('{}');
  });

  // AC07. A repeated logical operation reuses its deduplication key, so the
  // insert writes nothing and the existing event comes back instead.
  it('returns the existing event when the deduplication key repeats', async () => {
    const existing = { id: 'existing' };
    const { model: events, one } = model({ inserted: null, existing });
    expect(await events.append(event())).toBe(existing);
    expect(one.mock.calls[0][1]).toEqual([dedup]);
  });

  it('runs inside the caller transaction when one is supplied', async () => {
    const stored = { id: dedup };
    const { model: events, oneOrNone } = model({ inserted: null });
    const tx = { oneOrNone: vi.fn(async () => stored), one: vi.fn() };
    expect(await events.append(event(), { tx })).toBe(stored);
    expect(tx.oneOrNone).toHaveBeenCalledOnce();
    expect(oneOrNone).not.toHaveBeenCalled();
  });

  it('validates before touching the database', async () => {
    const { model: events, oneOrNone } = model();
    await expect(
      events.append(event({ event_key: 'tenant.exploded' }))
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(oneOrNone).not.toHaveBeenCalled();
  });

  it.each([
    ['a serialization failure', { code: '40001' }, 'CONFLICT'],
    ['a deadlock', { code: '40P01' }, 'CONFLICT'],
    ['an append-only violation', { code: '23514' }, 'AUDIT_UNAVAILABLE'],
    [
      'a lost connection',
      { code: '08006', message: 'postgres://nap-app:secret@host/db' },
      'AUDIT_UNAVAILABLE',
    ],
  ])('reports %s without database detail', async (_label, failure, code) => {
    const { model: events } = model({ failure });
    const thrown = await events.append(event()).catch(error => error);
    expect(thrown.code).toBe(code);
    expect(thrown.message).toBe(code);
    expect(JSON.stringify(thrown.message)).not.toContain('secret');
  });
});

describe('cursor encoding', () => {
  it('round-trips a microsecond position', () => {
    expect(
      parseEventCursor(encodeEventCursor(position, fingerprint), fingerprint)
    ).toEqual(position);
  });

  it('returns null when there is no next page', () => {
    expect(encodeEventCursor(null, fingerprint)).toBeNull();
    expect(parseEventCursor(undefined, fingerprint)).toBeNull();
    expect(parseEventCursor(null, fingerprint)).toBeNull();
  });

  it.each([
    ['an empty string', ''],
    ['a non-string', 42],
    ['text that is not base64url JSON', 'zzzz'],
    [
      'a payload for another operation',
      Buffer.from(
        JSON.stringify({
          v: 1,
          op: 'listMembershipsByUser',
          fingerprint,
          after: { occurred_at: '2026-09-19T00:00:00.000000Z', id: dedup },
        })
      ).toString('base64url'),
    ],
    [
      'a payload with a malformed position',
      Buffer.from(
        JSON.stringify({
          v: 1,
          op: 'listEvents',
          fingerprint,
          after: { occurred_at: 'yesterday', id: dedup },
        })
      ).toString('base64url'),
    ],
    [
      'a position truncated to milliseconds',
      Buffer.from(
        JSON.stringify({
          v: 1,
          op: 'listEvents',
          fingerprint,
          after: { occurred_at: '2026-09-19T10:00:00.123Z', id: dedup },
        })
      ).toString('base64url'),
    ],
  ])('rejects %s', (_label, cursor) => {
    expect(() => parseEventCursor(cursor, fingerprint)).toThrow(
      expect.objectContaining({ code: 'INVALID_INPUT' })
    );
  });
});
