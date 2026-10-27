/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { sessionResponseSchema } from '@nap/shared';
import { createApp } from '../../src/app.js';
import { runtimeConfiguration } from '../../src/application/shared/runtimeConfiguration.js';
import { errorEnvelope } from '../../src/framework/envelope.js';
import { readCookie } from '../../src/framework/cookies.js';
import { adminTenancyRoutesV1 } from '../../src/modules/admin-tenancy/apiRoutes/v1/index.js';
import {
  EVENT_CATALOGUE,
  EVENT_DETAIL_KEYS,
} from '../../src/modules/admin-tenancy/domain/events.js';
import {
  ARGON2_MINIMUM,
  PASSWORD_MAXIMUM,
  PASSWORD_MINIMUM,
  dummyVerify,
  hashPassword,
  needsRehash,
  parseHashingPolicy,
  parsePassword,
  verifyPassword,
} from '../../src/modules/admin-tenancy/domain/password.js';
import { KNOWN_DEVICE_COOKIE } from '../../src/framework/cookies.js';
import {
  issueKnownDeviceToken,
  parseKnownDevicePolicy,
  verifyKnownDeviceToken,
} from '../../src/modules/admin-tenancy/domain/knownDevice.js';
import {
  LOCK_MINUTES,
  THROTTLE_KINDS,
  THROTTLE_LIMITS,
  pairValue,
  normalizeAccountInput,
  normalizeClientAddress,
  parseThrottlePolicy,
  retryAfterSeconds,
  throttleKey,
} from '../../src/modules/admin-tenancy/domain/throttle.js';
import {
  FAILURE_CODES,
  parseAuthenticationPolicies,
} from '../../src/modules/admin-tenancy/domain/authentication.js';
import {
  createSessionToken,
  hashSessionToken,
} from '../../src/modules/admin-tenancy/domain/session.js';

const ORIGIN = 'http://localhost:5173';
const EMAIL = 'operator@nap.test';
const PASSWORD = 'correct-horse-battery';
const REPLACEMENT = 'a-longer-replacement-secret';

const sessionPolicy = {
  secret: 'unit-test-session-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
const cookiePolicy = { secure: false, sameSite: 'lax' };
const authenticationPolicy = {
  throttleSecret: 'unit-test-throttle-secret-of-ample-length',
  knownDeviceSecret: 'unit-test-known-device-secret-of-ample-length',
  ...ARGON2_MINIMUM,
};
const throttlePolicy = { secret: authenticationPolicy.throttleSecret };

/** Hashing in every case would dominate the run; one shared digest covers it. */
let storedHash;

beforeAll(async () => {
  storedHash = await hashPassword(ARGON2_MINIMUM, PASSWORD);
}, 20_000);

/**
 * Build a portal-user credential row shaped like the credential projection.
 * @param {object} [overrides]
 * @returns {object}
 */
function user(overrides = {}) {
  return {
    id: randomUUID(),
    email: EMAIL,
    password_hash: storedHash,
    must_change_password: false,
    status: 'active',
    ...overrides,
  };
}

/**
 * Build a session row shaped like the model's joined projection.
 * @param {object} [overrides]
 * @returns {object}
 */
function sessionRow(overrides = {}) {
  const created = new Date();
  return {
    id: randomUUID(),
    portal_user_id: randomUUID(),
    token_hash: null,
    tenant_id: null,
    last_seen_at: created,
    idle_expires_at: new Date(created.getTime() + 30 * 60_000),
    absolute_expires_at: new Date(created.getTime() + 12 * 3_600_000),
    created_at: created,
    updated_at: created,
    deactivated_at: null,
    user_status: 'active',
    must_change_password: false,
    user_archived: false,
    expired: false,
    stale: false,
    ...overrides,
  };
}

/**
 * Build an in-memory admin handle covering the tables authentication touches.
 *
 * The throttle window arithmetic here is a readable restatement, not the
 * statement the model runs. PostgreSQL decides it for real, against one
 * `now()` and one row lock, so the window, the lock, and their concurrency are
 * asserted in the database integration test instead. What this handle is for
 * is the HTTP layer: status codes, envelopes, cookies, and events.
 * @param {{users?: object[], sessions?: object[]}} [seed]
 * @returns {{db: object, events: object[], users: object[], throttles: Map<string, object>}}
 */
function fakeAdmin({ users = [], sessions = [], memberships = [] } = {}) {
  const events = [];
  const throttles = new Map();
  const byHash = new Map(
    sessions.filter(row => row.token_hash).map(row => [row.token_hash, row])
  );
  const live = () =>
    [...byHash.values()].filter(r => r.deactivated_at === null);
  const db = {
    tx: operation => operation({}),
    managed_events: {
      append: async event => {
        events.push(event);
        return event;
      },
    },
    cache_revisions: { advance: async keys => keys },
    portal_user_tenants: {
      lockPendingByUser: async portalUserId =>
        memberships.filter(
          row =>
            row.portal_user_id === portalUserId &&
            row.status === 'pending' &&
            row.deactivated_at === null
        ),
      update: async (id, dto) => {
        const found = memberships.find(row => row.id === id);
        Object.assign(found, dto);
        return { ...found };
      },
    },
    portal_users: {
      findOneBy: async conditions => {
        const [[column, value]] = Object.entries(conditions);
        const found = users.find(row => row[column] === value);
        return found ? { ...found } : null;
      },
      replacePassword: async (id, hash) => {
        const found = users.find(
          row => row.id === id && row.status === 'active'
        );
        if (!found) return null;
        found.password_hash = hash;
        found.must_change_password = false;
        return { id };
      },
      rehashPassword: async (id, hash) => {
        const found = users.find(
          row => row.id === id && row.status === 'active'
        );
        if (!found) return null;
        found.password_hash = hash;
        return { id };
      },
    },
    login_throttles: {
      lockedUntil: async keys => {
        const locked = keys
          .map(key => throttles.get(key))
          .filter(row => row?.locked_until > new Date())
          .sort((a, b) => b.locked_until - a.locked_until);
        return locked[0] ?? null;
      },
      recordFailure: async (key, limits) => {
        const now = new Date();
        const existing = throttles.get(key);
        const lockSpent =
          existing?.locked_until && existing.locked_until <= now;
        const spent =
          existing &&
          ((lockSpent && existing.failures >= limits.maxFailures) ||
            ((!existing.locked_until || lockSpent) &&
              existing.window_started_at <=
                new Date(now.getTime() - limits.windowMinutes * 60_000)));
        const failures = !existing || spent ? 1 : existing.failures + 1;
        const delayFrom = limits.delayFrom ?? null;
        const row = {
          key_hash: key,
          failures,
          window_started_at:
            !existing || spent ? now : existing.window_started_at,
          last_failed_at: now,
          locked_until:
            existing?.locked_until > now
              ? existing.locked_until
              : failures >= limits.maxFailures
                ? new Date(now.getTime() + limits.lockMinutes * 60_000)
                : delayFrom !== null && failures >= delayFrom
                  ? new Date(
                      now.getTime() +
                        Math.min(
                          2 ** (failures - delayFrom + 1),
                          limits.delayCapSeconds
                        ) *
                          1000
                    )
                  : null,
        };
        throttles.set(key, row);
        return row;
      },
      clear: async key => (throttles.delete(key) ? 1 : 0),
      purgeExpired: async () => 0,
    },
    sessions: {
      lockLiveForUser: async () => [],
      insertSession: async ({ portalUserId, tokenHash, userAgent }) => {
        const row = sessionRow({
          portal_user_id: portalUserId,
          token_hash: tokenHash,
          user_agent: userAgent,
        });
        byHash.set(tokenHash, row);
        return { ...row };
      },
      // The real statement joins `admin.portal_users` for the account flags
      // resolution needs, and `restricted` is derived from one of them, so
      // the fake has to join too or every session would resolve unrestricted.
      findByTokenHash: async hash => {
        const found = byHash.get(hash);
        if (!found || found.deactivated_at !== null) return null;
        const account = users.find(row => row.id === found.portal_user_id);
        return {
          ...found,
          user_status: account?.status ?? 'active',
          must_change_password: account?.must_change_password === true,
          user_archived: account === undefined,
        };
      },
      findAnyById: async id =>
        [...byHash.values()].find(row => row.id === id) ?? null,
      rotate: async (currentHash, nextHash) => {
        const found = byHash.get(currentHash);
        if (!found || found.deactivated_at !== null) return null;
        byHash.delete(currentHash);
        found.token_hash = nextHash;
        byHash.set(nextHash, found);
        return { ...found };
      },
      archiveForUser: async (portalUserId, exceptId) => {
        const archived = live().filter(
          row => row.portal_user_id === portalUserId && row.id !== exceptId
        );
        for (const row of archived) row.deactivated_at = new Date();
        return archived.map(row => ({ id: row.id, tenant_id: row.tenant_id }));
      },
      archiveById: async id => {
        const found = live().find(row => row.id === id);
        if (!found) return null;
        found.deactivated_at = new Date();
        return { ...found };
      },
      archiveByTokenHash: async hash => {
        const found = byHash.get(hash);
        if (!found || found.deactivated_at !== null) return null;
        found.deactivated_at = new Date();
        return { ...found };
      },
      touch: async () => null,
    },
  };
  return { db, events, users, throttles, sessions: byHash, memberships };
}

/**
 * Build the API with a fake admin handle and the real route table.
 * @param {object} [seed]
 * @returns {{app: import('express').Express, admin: object}}
 */
function api(seed) {
  const admin = fakeAdmin(seed);
  const app = createApp({
    api: {
      admin,
      sessionPolicy,
      authenticationPolicy,
      cookiePolicy,
      applicationOrigin: ORIGIN,
      registrations: adminTenancyRoutesV1,
    },
  });
  return { app, admin };
}

/**
 * Read the session cookie from a response's `Set-Cookie` header.
 * @param {object} response Supertest response.
 * @returns {{value: string|undefined, attributes: string}|undefined}
 */
function sessionCookie(response) {
  const header = (response.headers['set-cookie'] ?? []).find(entry =>
    entry.startsWith('nap_session=')
  );
  if (!header) return undefined;
  return {
    value: readCookie(header.split(';')[0], 'nap_session'),
    attributes: header,
  };
}

/**
 * Read the known-device cookie from a response's `Set-Cookie` header.
 * @param {object} response Supertest response.
 * @returns {{value: string|undefined, attributes: string}|undefined}
 */
function deviceCookie(response) {
  const header = (response.headers['set-cookie'] ?? []).find(entry =>
    entry.startsWith(`${KNOWN_DEVICE_COOKIE}=`)
  );
  if (!header) return undefined;
  return {
    value: readCookie(header.split(';')[0], KNOWN_DEVICE_COOKIE),
    attributes: header,
  };
}

/**
 * End every live delay, leaving hard locks alone, as if the caller waited.
 * @param {{throttles: Map<string, object>}} admin
 * @returns {void}
 */
function waitOutDelays(admin) {
  for (const row of admin.throttles.values())
    if (row.locked_until && row.locked_until - Date.now() <= 30_000)
      row.locked_until = new Date(Date.now() - 1);
}

/** Post to a route with a trusted `Origin`. */
function post(app, path, body) {
  const pending = request(app)
    .post(`/api/admin-tenancy/v1${path}`)
    .set('Origin', ORIGIN);
  return body === undefined ? pending : pending.send(body);
}

/** Seed one live session for a user and return its token. */
function issue(user, overrides = {}) {
  const token = createSessionToken();
  return {
    token,
    row: sessionRow({
      portal_user_id: user.id,
      token_hash: hashSessionToken(sessionPolicy, token),
      must_change_password: user.must_change_password,
      user_status: user.status,
      ...overrides,
    }),
  };
}

describe('password policy', () => {
  it('counts Unicode characters, not UTF-16 units', () => {
    const emoji = '🔐'.repeat(PASSWORD_MINIMUM);
    expect(emoji.length).toBe(PASSWORD_MINIMUM * 2);
    expect(parsePassword(emoji)).toBe(emoji);
    expect(() => parsePassword('🔐'.repeat(PASSWORD_MINIMUM - 1))).toThrow(
      'INVALID_INPUT'
    );
  });

  it('accepts the documented bounds and nothing outside them', () => {
    expect(parsePassword('x'.repeat(PASSWORD_MINIMUM))).toHaveLength(8);
    expect(parsePassword('x'.repeat(PASSWORD_MAXIMUM))).toHaveLength(128);
    for (const value of [
      'x'.repeat(PASSWORD_MINIMUM - 1),
      'x'.repeat(PASSWORD_MAXIMUM + 1),
      '',
      undefined,
      null,
      12345678901234,
    ])
      expect(() => parsePassword(value)).toThrow('INVALID_INPUT');
  });

  it('refuses hashing parameters weaker than the PRD floor', () => {
    expect(parseHashingPolicy(ARGON2_MINIMUM)).toEqual(ARGON2_MINIMUM);
    for (const change of [
      { memoryKib: ARGON2_MINIMUM.memoryKib - 1 },
      { timeCost: 1 },
      { parallelism: 0 },
      { memoryKib: 19456.5 },
    ])
      expect(() =>
        parseHashingPolicy({ ...ARGON2_MINIMUM, ...change })
      ).toThrow('INVALID_INPUT');
  });
});

describe('password hashing', () => {
  it('salts every digest and verifies only the right password', async () => {
    const second = await hashPassword(ARGON2_MINIMUM, PASSWORD);
    expect(second).not.toBe(storedHash);
    expect(storedHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(await verifyPassword(storedHash, PASSWORD)).toBe(true);
    expect(await verifyPassword(storedHash, REPLACEMENT)).toBe(false);
  }, 20_000);

  it('reports a malformed stored digest as a mismatch, not an error', async () => {
    expect(await verifyPassword('argon2id$placeholder', PASSWORD)).toBe(false);
    expect(await verifyPassword('', PASSWORD)).toBe(false);
  });

  it('rehashes on an increase and leaves a decrease alone', () => {
    expect(needsRehash(ARGON2_MINIMUM, storedHash)).toBe(false);
    expect(
      needsRehash({ ...ARGON2_MINIMUM, memoryKib: 65536 }, storedHash)
    ).toBe(true);
    expect(needsRehash({ ...ARGON2_MINIMUM, timeCost: 3 }, storedHash)).toBe(
      true
    );
    // A stronger stored digest under weaker configuration stays as it is.
    expect(
      needsRehash(ARGON2_MINIMUM, storedHash.replace('m=19456', 'm=65536'))
    ).toBe(false);
    expect(needsRehash(ARGON2_MINIMUM, 'not-a-digest')).toBe(true);
    expect(
      needsRehash(ARGON2_MINIMUM, storedHash.replace('argon2id', 'argon2i'))
    ).toBe(true);
  });

  it('spends real work on an account that does not exist', async () => {
    expect(await dummyVerify(ARGON2_MINIMUM)).toBe(false);
  }, 20_000);
});

describe('throttle keys', () => {
  it('hashes under the secret and never echoes its input', () => {
    const key = throttleKey(throttlePolicy, THROTTLE_KINDS.account, EMAIL);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain('nap.test');
    expect(key).toBe(
      throttleKey(throttlePolicy, THROTTLE_KINDS.account, EMAIL)
    );
    expect(key).not.toBe(
      throttleKey(
        { secret: 'a-different-secret-of-ample-length!!' },
        THROTTLE_KINDS.account,
        EMAIL
      )
    );
  });

  it('separates the two dimensions for one value', () => {
    const value = '203.0.113.7';
    expect(throttleKey(throttlePolicy, THROTTLE_KINDS.account, value)).not.toBe(
      throttleKey(throttlePolicy, THROTTLE_KINDS.address, value)
    );
  });

  it('normalizes both inputs so one client cannot become two keys', () => {
    expect(normalizeAccountInput('  Operator@NAP.test ')).toBe(EMAIL);
    expect(normalizeAccountInput(undefined)).toBe('');
    expect(normalizeClientAddress('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(normalizeClientAddress('2001:DB8::1')).toBe('2001:db8::1');
    expect(normalizeClientAddress(undefined)).toBe('');
  });

  it('rejects a throttle secret too short to key an HMAC', () => {
    expect(() => parseThrottlePolicy({ secret: 'short' })).toThrow(
      'INVALID_INPUT'
    );
    expect(parseThrottlePolicy(throttlePolicy)).toEqual(throttlePolicy);
  });

  it('rounds a retry delay up and never invites an immediate retry', () => {
    expect(retryAfterSeconds(new Date(Date.now() + 200))).toBe(1);
    expect(retryAfterSeconds(new Date(Date.now() + 61_000))).toBe(61);
    expect(retryAfterSeconds(null)).toBe(1);
  });

  it('rejects policies missing any of the three parts', () => {
    const whole = {
      session: sessionPolicy,
      hashing: ARGON2_MINIMUM,
      throttle: throttlePolicy,
    };
    expect(parseAuthenticationPolicies(whole)).toEqual(whole);
    for (const change of [
      { session: undefined },
      { hashing: undefined },
      { throttle: undefined },
      { throttle: { secret: 'short' } },
    ])
      expect(() =>
        parseAuthenticationPolicies({ ...whole, ...change })
      ).toThrow('INVALID_INPUT');
    expect(() => parseAuthenticationPolicies(null)).toThrow('INVALID_INPUT');
  });
});

describe('throttle limits', () => {
  it('states the M0001-13 limits per kind', () => {
    expect(THROTTLE_LIMITS).toEqual({
      pair: { maxFailures: 5, delayFrom: null },
      address: { maxFailures: 100, delayFrom: 10 },
      account: { maxFailures: 20, delayFrom: 1 },
    });
  });

  it('keeps pair values unambiguous and distinct from other kinds', () => {
    expect(pairValue('a|b', 'c')).not.toBe(pairValue('a', 'b|c'));
    const value = pairValue(EMAIL, '203.0.113.7');
    expect(throttleKey(throttlePolicy, THROTTLE_KINDS.pair, value)).not.toBe(
      throttleKey(throttlePolicy, THROTTLE_KINDS.account, value)
    );
  });
});

describe('known-device tokens', () => {
  const policy = { secret: authenticationPolicy.knownDeviceSecret };
  const credential = {
    id: '00000000-0000-4000-8000-000000000001',
    email: EMAIL,
    password_hash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA',
  };

  it('verifies a token for its own user and account', () => {
    const { token } = issueKnownDeviceToken(policy, credential);
    expect(verifyKnownDeviceToken(policy, token, credential, EMAIL)).toBe(true);
  });

  it('AC06: treats a tampered, foreign, or expired token as unknown', () => {
    const { token } = issueKnownDeviceToken(policy, credential);
    // Change a middle signature character, which always changes the bytes.
    const at = token.length - 10;
    const tampered =
      token.slice(0, at) +
      (token[at] === 'A' ? 'B' : 'A') +
      token.slice(at + 1);
    // And the last one: a 32-byte signature's last character sits at an
    // alphabet index that is a multiple of 4, so index + 1 changes only the
    // two bits base64url ignores — the same bytes, spelled differently.
    const ALPHABET =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const last = ALPHABET.indexOf(token.at(-1));
    const respelled = token.slice(0, -1) + ALPHABET[last + 1];
    const signatureOf = value => Buffer.from(value.split('.')[2], 'base64url');
    expect(signatureOf(respelled)).toEqual(signatureOf(token));
    expect(verifyKnownDeviceToken(policy, respelled, credential, EMAIL)).toBe(
      false
    );
    expect(verifyKnownDeviceToken(policy, tampered, credential, EMAIL)).toBe(
      false
    );
    expect(
      verifyKnownDeviceToken(policy, token, credential, 'someone@nap.test')
    ).toBe(false);
    expect(
      verifyKnownDeviceToken(
        policy,
        token,
        { ...credential, id: '00000000-0000-4000-8000-000000000002' },
        EMAIL
      )
    ).toBe(false);
    const old = issueKnownDeviceToken(policy, credential, 0).token;
    expect(verifyKnownDeviceToken(policy, old, credential, EMAIL)).toBe(false);
    expect(verifyKnownDeviceToken(policy, 'junk', credential, EMAIL)).toBe(
      false
    );
    expect(verifyKnownDeviceToken(policy, token, null, EMAIL)).toBe(false);
  });

  it('AC07: a password change voids every earlier token', () => {
    const { token } = issueKnownDeviceToken(policy, credential);
    expect(
      verifyKnownDeviceToken(
        policy,
        token,
        { ...credential, password_hash: '$argon2id$v=19$changed' },
        EMAIL
      )
    ).toBe(false);
  });

  it('rejects a known-device secret too short to key an HMAC', () => {
    expect(() => parseKnownDevicePolicy({ secret: 'short' })).toThrow(
      'INVALID_INPUT'
    );
  });
});

describe('POST /auth/login', () => {
  it('authenticates an active account and issues a session cookie', async () => {
    const account = user();
    const { app, admin } = api({ users: [account] });
    const response = await post(app, '/auth/login', {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(response.status).toBe(200);
    expect(sessionResponseSchema.parse(response.body).data).toMatchObject({
      user: account.id,
      restricted: false,
    });
    const cookie = sessionCookie(response);
    expect(cookie.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie.attributes).toContain('HttpOnly');
    expect(cookie.attributes).toContain('SameSite=Lax');
    expect(admin.events.map(event => event.event_key)).toEqual([
      'session.created',
      'auth.login.succeeded',
    ]);
  }, 20_000);

  it('stores the capped User-Agent on the new session, or null without one (M0001-14-R001)', async () => {
    const { app, admin } = api({ users: [user()] });
    await post(app, '/auth/login', { email: EMAIL, password: PASSWORD }).set(
      'User-Agent',
      `  ${'x'.repeat(600)}  `
    );
    await request(app)
      .post('/api/admin-tenancy/v1/auth/login')
      .set('Origin', ORIGIN)
      .unset('User-Agent')
      .send({ email: EMAIL, password: PASSWORD });
    expect([...admin.sessions.values()].map(row => row.user_agent)).toEqual([
      'x'.repeat(512),
      null,
    ]);
  }, 20_000);

  it('accepts a differently cased and padded address', async () => {
    const { app } = api({ users: [user()] });
    const response = await post(app, '/auth/login', {
      email: '  Operator@NAP.test  ',
      password: PASSWORD,
    });
    expect(response.status).toBe(200);
  }, 20_000);

  it('gives every ineligible and invalid case the same rejection', async () => {
    const cases = [
      ['wrong password', { email: EMAIL, password: 'wrong-password-here' }],
      ['unknown account', { email: 'nobody@nap.test', password: PASSWORD }],
      ['unparseable account', { email: 'not-an-address', password: PASSWORD }],
      ['empty body', {}],
      ['wrong body shape', { email: 1, password: true }],
      ['extra field', { email: EMAIL, password: PASSWORD, admin: true }],
    ];
    for (const [name, body] of cases) {
      const { app } = api({ users: [user()] });
      const response = await post(app, '/auth/login', body);
      expect(response.status, name).toBe(401);
      expect(response.body, name).toEqual(errorEnvelope('UNAUTHENTICATED'));
      expect(sessionCookie(response), name).toBeUndefined();
    }
    for (const status of ['locked', 'disabled']) {
      const { app } = api({ users: [user({ status })] });
      const response = await post(app, '/auth/login', {
        email: EMAIL,
        password: PASSWORD,
      });
      expect(response.status, status).toBe(401);
      expect(response.body, status).toEqual(errorEnvelope('UNAUTHENTICATED'));
    }
  }, 60_000);

  it('records why a failure happened without naming the account', async () => {
    const account = user();
    const { app, admin } = api({ users: [account] });
    await post(app, '/auth/login', {
      email: EMAIL,
      password: 'nope-nope-nope',
    });
    const [event] = admin.events;
    expect(event.event_key).toBe('auth.login.failed');
    expect(event.outcome).toBe('failed');
    expect(event.actor_id).toBe(account.id);
    expect(event.details.code).toBe(FAILURE_CODES.badPassword);
    expect(event.details.throttle_key).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(event)).not.toContain('nap.test');
  }, 20_000);

  it('confines a temporary password to password change and logout', async () => {
    const account = user({ must_change_password: true });
    const { app } = api({ users: [account] });
    const response = await post(app, '/auth/login', {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(response.body.data.restricted).toBe(true);
    const cookie = `nap_session=${sessionCookie(response).value}`;
    const current = await request(app)
      .get('/api/admin-tenancy/v1/session/current')
      .set('Cookie', cookie);
    expect(current.status).toBe(403);
    expect(current.body).toEqual(errorEnvelope('PASSWORD_CHANGE_REQUIRED'));
    const rotate = await post(app, '/session/rotate').set('Cookie', cookie);
    expect(rotate.status).toBe(403);
    const logout = await post(app, '/auth/logout').set('Cookie', cookie);
    expect(logout.status).toBe(204);
  }, 20_000);

  it('delays the account from its first failure and answers with Retry-After', async () => {
    const { app, admin } = api({ users: [user()] });
    const failed = await post(app, '/auth/login', {
      email: EMAIL,
      password: 'wrong-password-here',
    });
    expect(failed.status).toBe(401);
    const throttled = await post(app, '/auth/login', {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(throttled.status).toBe(429);
    expect(throttled.body).toEqual(errorEnvelope('THROTTLED'));
    const retry = Number(throttled.headers['retry-after']);
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(2);
    const last = admin.events.at(-1);
    expect(last.event_key).toBe('auth.login.throttled');
    expect(last.outcome).toBe('denied');
    expect(last.details).toMatchObject({
      kind: THROTTLE_KINDS.account,
      retry_after_seconds: retry,
    });
  }, 60_000);

  it('AC01: a corrected email succeeds after the mistyped pair hard-locks', async () => {
    const { app, admin } = api({ users: [user()] });
    for (let n = 0; n < THROTTLE_LIMITS.pair.maxFailures; n += 1) {
      waitOutDelays(admin);
      const response = await post(app, '/auth/login', {
        email: 'operator@npa.test',
        password: PASSWORD,
      });
      expect(response.status).toBe(401);
    }
    waitOutDelays(admin);
    const mistyped = await post(app, '/auth/login', {
      email: 'operator@npa.test',
      password: PASSWORD,
    });
    expect(mistyped.status).toBe(429);
    expect(mistyped.headers['retry-after']).toBe(String(LOCK_MINUTES * 60));
    expect(admin.events.at(-1).details.kind).toBe(THROTTLE_KINDS.pair);
    const corrected = await post(app, '/auth/login', {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(corrected.status).toBe(200);
  }, 60_000);

  it('AC05: a known device signs in past an account lock', async () => {
    const { app, admin } = api({ users: [user()] });
    const first = await post(app, '/auth/login', {
      email: EMAIL,
      password: PASSWORD,
    });
    const device = deviceCookie(first);
    expect(device.value).toBeTruthy();
    expect(device.attributes).toMatch(/HttpOnly/i);
    expect(device.attributes).toMatch(/SameSite=Lax/i);
    expect(device.attributes).toMatch(/Max-Age=7776000/);
    // An attacker from elsewhere locks the account.
    const accountKey = throttleKey(
      throttlePolicy,
      THROTTLE_KINDS.account,
      EMAIL
    );
    admin.throttles.set(accountKey, {
      key_hash: accountKey,
      failures: THROTTLE_LIMITS.account.maxFailures,
      window_started_at: new Date(),
      last_failed_at: new Date(),
      locked_until: new Date(Date.now() + LOCK_MINUTES * 60_000),
    });
    const stranger = await post(app, '/auth/login', {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(stranger.status).toBe(429);
    const known = await post(app, '/auth/login', {
      email: EMAIL,
      password: PASSWORD,
    }).set('Cookie', `${KNOWN_DEVICE_COOKIE}=${device.value}`);
    expect(known.status).toBe(200);
  }, 60_000);

  it('issues no known-device cookie for a restricted session', async () => {
    const { app } = api({ users: [user({ must_change_password: true })] });
    const response = await post(app, '/auth/login', {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(response.status).toBe(200);
    expect(deviceCookie(response)).toBeUndefined();
  }, 60_000);

  it('rehashes a digest stored under weaker parameters', async () => {
    const weak = await hashPassword(ARGON2_MINIMUM, PASSWORD);
    const account = user({ password_hash: weak });
    const admin = fakeAdmin({ users: [account] });
    const app = createApp({
      api: {
        admin,
        sessionPolicy,
        authenticationPolicy: { ...authenticationPolicy, memoryKib: 32768 },
        cookiePolicy,
        applicationOrigin: ORIGIN,
        registrations: adminTenancyRoutesV1,
      },
    });
    const response = await post(app, '/auth/login', {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(response.status).toBe(200);
    expect(admin.users[0].password_hash).not.toBe(weak);
    expect(admin.users[0].password_hash).toContain('m=32768');
    expect(await verifyPassword(admin.users[0].password_hash, PASSWORD)).toBe(
      true
    );
  }, 60_000);
});

describe('POST /auth/password', () => {
  /** Seed an account with one live session and mount the API. */
  function withSession(overrides = {}, memberships = []) {
    const account = user(overrides);
    const own = issue(account);
    const other = issue(account);
    const admin = fakeAdmin({
      users: [account],
      sessions: [own.row, other.row],
      memberships: memberships.map(row => ({
        id: randomUUID(),
        portal_user_id: account.id,
        tenant_id: randomUUID(),
        member_id: randomUUID(),
        status: 'pending',
        ready: false,
        deactivated_at: null,
        ...row,
      })),
    });
    const app = createApp({
      api: {
        admin,
        sessionPolicy,
        authenticationPolicy,
        cookiePolicy,
        applicationOrigin: ORIGIN,
        registrations: adminTenancyRoutesV1,
      },
    });
    return { app, admin, account, own, other };
  }

  it('replaces the password, rotates the cookie, and revokes every other session', async () => {
    const { app, admin, account, own, other } = withSession({
      must_change_password: true,
    });
    const response = await post(app, '/auth/password', {
      currentPassword: PASSWORD,
      newPassword: REPLACEMENT,
    }).set('Cookie', `nap_session=${own.token}`);
    expect(response.status).toBe(200);
    expect(sessionResponseSchema.parse(response.body).data).toMatchObject({
      id: own.row.id,
      restricted: false,
    });
    expect(admin.users[0].must_change_password).toBe(false);
    expect(
      await verifyPassword(admin.users[0].password_hash, REPLACEMENT)
    ).toBe(true);
    expect(other.row.deactivated_at).not.toBeNull();
    expect(own.row.deactivated_at).toBeNull();
    const reissued = sessionCookie(response).value;
    expect(reissued).not.toBe(own.token);
    expect(own.row.token_hash).toBe(hashSessionToken(sessionPolicy, reissued));
    const changed = admin.events.find(
      event => event.event_key === 'auth.password.changed'
    );
    expect(changed.details).toEqual({ forced: true });
    expect(changed.actor_id).toBe(account.id);
    expect(JSON.stringify(admin.events)).not.toContain(REPLACEMENT);
    expect(JSON.stringify(admin.events)).not.toContain('$argon2id$');
  }, 20_000);

  it('activates every pending membership when the temporary password is replaced (I0008-R012)', async () => {
    const { app, admin, own } = withSession({ must_change_password: true }, [
      {},
      { member_id: null },
      { status: 'suspended' },
    ]);
    const response = await post(app, '/auth/password', {
      currentPassword: PASSWORD,
      newPassword: REPLACEMENT,
    }).set('Cookie', `nap_session=${own.token}`);
    expect(response.status).toBe(200);
    const [linked, unlinked, suspended] = admin.memberships;
    expect(linked).toMatchObject({ status: 'active', ready: true });
    expect(unlinked).toMatchObject({ status: 'active', ready: false });
    expect(suspended.status).toBe('suspended');
    const activated = admin.events.filter(
      event => event.event_key === 'membership.activated'
    );
    expect(activated.map(event => event.target_id)).toEqual([
      linked.id,
      unlinked.id,
    ]);
  }, 20_000);

  it('leaves pending memberships alone on a later password change', async () => {
    const { app, admin, own } = withSession({}, [{}]);
    const response = await post(app, '/auth/password', {
      currentPassword: PASSWORD,
      newPassword: REPLACEMENT,
    }).set('Cookie', `nap_session=${own.token}`);
    expect(response.status).toBe(200);
    expect(admin.memberships[0].status).toBe('pending');
  }, 20_000);

  it('refuses a wrong current password without touching the stored hash', async () => {
    const { app, admin, own } = withSession();
    const response = await post(app, '/auth/password', {
      currentPassword: 'not-the-password',
      newPassword: REPLACEMENT,
    }).set('Cookie', `nap_session=${own.token}`);
    expect(response.status).toBe(401);
    expect(response.body).toEqual(errorEnvelope('UNAUTHENTICATED'));
    expect(admin.users[0].password_hash).toBe(storedHash);
    expect(admin.events).toEqual([]);
  }, 20_000);

  it('refuses a replacement that is too short, too long, or unchanged', async () => {
    for (const newPassword of [
      'x'.repeat(PASSWORD_MINIMUM - 1),
      'x'.repeat(PASSWORD_MAXIMUM + 1),
      PASSWORD,
    ]) {
      const { app, admin, own } = withSession();
      const response = await post(app, '/auth/password', {
        currentPassword: PASSWORD,
        newPassword,
      }).set('Cookie', `nap_session=${own.token}`);
      expect(response.status, newPassword.length).toBe(400);
      expect(response.body).toEqual(errorEnvelope('INVALID_INPUT'));
      expect(admin.users[0].password_hash).toBe(storedHash);
    }
  }, 60_000);

  it('requires a session', async () => {
    const { app } = withSession();
    const response = await post(app, '/auth/password', {
      currentPassword: PASSWORD,
      newPassword: REPLACEMENT,
    });
    expect(response.status).toBe(401);
    expect(response.body).toEqual(errorEnvelope('UNAUTHENTICATED'));
  });

  it('rejects a malformed body before reading a credential', async () => {
    const { app, admin, own } = withSession();
    const response = await post(app, '/auth/password', { newPassword: 1 }).set(
      'Cookie',
      `nap_session=${own.token}`
    );
    expect(response.status).toBe(400);
    expect(admin.users[0].password_hash).toBe(storedHash);
  });
});

describe('browser request protection', () => {
  const cases = [
    [{ Origin: ORIGIN }, true],
    [{ Origin: 'http://localhost:5174' }, false],
    [{ Origin: 'https://localhost:5173' }, false],
    [{ Origin: 'null' }, false],
    [{ Origin: 'not a url' }, false],
    [{ Referer: `${ORIGIN}/login` }, true],
    [{ Referer: 'http://evil.example/login' }, false],
    [{ Referer: 'not a url' }, false],
    [{ Origin: 'http://evil.example', Referer: `${ORIGIN}/login` }, false],
    [{}, false],
  ];

  it.each(cases)(
    'guards login with %j',
    async (headers, allowed) => {
      const { app, admin } = api({ users: [user()] });
      const response = await request(app)
        .post('/api/admin-tenancy/v1/auth/login')
        .set(headers)
        .send({ email: EMAIL, password: PASSWORD });
      if (allowed) {
        expect(response.status).toBe(200);
        return;
      }
      expect(response.status).toBe(403);
      expect(response.body).toEqual(errorEnvelope('FORBIDDEN'));
      expect(admin.events).toEqual([]);
      expect(sessionCookie(response)).toBeUndefined();
    },
    20_000
  );

  it.each(cases)(
    'guards password change with %j',
    async (headers, allowed) => {
      const account = user();
      const own = issue(account);
      const admin = fakeAdmin({ users: [account], sessions: [own.row] });
      const app = createApp({
        api: {
          admin,
          sessionPolicy,
          authenticationPolicy,
          cookiePolicy,
          applicationOrigin: ORIGIN,
          registrations: adminTenancyRoutesV1,
        },
      });
      const response = await request(app)
        .post('/api/admin-tenancy/v1/auth/password')
        .set({ ...headers, Cookie: `nap_session=${own.token}` })
        .send({ currentPassword: PASSWORD, newPassword: REPLACEMENT });
      if (allowed) {
        expect(response.status).toBe(200);
        return;
      }
      expect(response.status).toBe(403);
      expect(response.body).toEqual(errorEnvelope('FORBIDDEN'));
      expect(admin.users[0].password_hash).toBe(storedHash);
      expect(admin.events).toEqual([]);
    },
    20_000
  );
});

describe('authentication events', () => {
  it('keeps every new detail key inside the shared vocabulary', () => {
    for (const key of [
      'auth.login.succeeded',
      'auth.login.failed',
      'auth.login.throttled',
      'auth.password.changed',
    ])
      for (const detail of EVENT_CATALOGUE[key].details)
        expect(EVENT_DETAIL_KEYS, key).toContain(detail);
  });
});

describe('authentication configuration', () => {
  const base = {
    NODE_ENV: 'test',
    ADMIN_DATABASE_TEST: 'db.example/nap_test_admin',
    NAP_APP_PSWD_TEST: 'runtime-secret',
    SESSION_SECRET_TEST: 'test-session-secret-of-ample-length-here',
    AUTH_THROTTLE_SECRET_TEST: 'test-throttle-secret-of-ample-length-here',
    KNOWN_DEVICE_SECRET_TEST: 'test-known-device-secret-of-ample-length',
    TAX_ID_ENCRYPTION_KEY_TEST: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
    FILE_STORAGE_ENCRYPTION_KEY_TEST:
      'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8=',
    TAX_ID_HASH_KEY_TEST: 'test-tax-id-hash-key-of-ample-length',
    APP_ORIGIN_TEST: 'http://localhost:5173',
  };

  it('defaults the Argon2id parameters to the PRD floor', () => {
    expect(runtimeConfiguration(base).authentication).toEqual({
      throttleSecret: base.AUTH_THROTTLE_SECRET_TEST,
      knownDeviceSecret: base.KNOWN_DEVICE_SECRET_TEST,
      ...ARGON2_MINIMUM,
    });
  });

  it('accepts a raised cost and keeps the throttle secret distinct', () => {
    const raised = runtimeConfiguration({
      ...base,
      ARGON2_MEMORY_KIB: '65536',
      ARGON2_TIME_COST: '3',
      ARGON2_PARALLELISM: '2',
    }).authentication;
    expect(raised).toMatchObject({
      memoryKib: 65536,
      timeCost: 3,
      parallelism: 2,
    });
    expect(raised.throttleSecret).not.toBe(base.SESSION_SECRET_TEST);
  });

  it('refuses a weak secret and any parameter below the floor', () => {
    for (const change of [
      { AUTH_THROTTLE_SECRET_TEST: undefined },
      { AUTH_THROTTLE_SECRET_TEST: 'short' },
      { AUTH_THROTTLE_SECRET_TEST: '<test-throttle-secret>' },
      { ARGON2_MEMORY_KIB: '19455' },
      { ARGON2_TIME_COST: '1' },
      { ARGON2_PARALLELISM: '0' },
      { ARGON2_MEMORY_KIB: 'lots' },
      { ARGON2_TIME_COST: '2.5' },
      // A throttle secret identical to the session secret would let one leak
      // compromise both HMACs, so startup rejects the pair regardless of
      // which value the operator copy-pasted into the other setting.
      { AUTH_THROTTLE_SECRET_TEST: base.SESSION_SECRET_TEST },
      { KNOWN_DEVICE_SECRET_TEST: undefined },
      { KNOWN_DEVICE_SECRET_TEST: 'short' },
      { KNOWN_DEVICE_SECRET_TEST: base.SESSION_SECRET_TEST },
      { KNOWN_DEVICE_SECRET_TEST: base.AUTH_THROTTLE_SECRET_TEST },
      { TAX_ID_HASH_KEY_TEST: base.KNOWN_DEVICE_SECRET_TEST },
    ])
      expect(() => runtimeConfiguration({ ...base, ...change })).toThrow(
        'INVALID_CONFIGURATION'
      );
  });
});
