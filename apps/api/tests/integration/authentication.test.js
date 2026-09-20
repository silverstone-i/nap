/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createAdminDatabase,
  using,
} from '../../src/infrastructure/runtime/adminDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateAdmin } from '../../src/application/maintenance/migrateAdmin.js';
import { roleUrl } from '../../src/application/shared/configuration.js';
import {
  FAILURE_CODES,
  changePassword,
  login,
} from '../../src/modules/admin-tenancy/domain/authentication.js';
import {
  ARGON2_MINIMUM,
  hashPassword,
  verifyPassword,
} from '../../src/modules/admin-tenancy/domain/password.js';
import {
  LOCK_MINUTES,
  MAX_FAILURES,
  RETENTION_HOURS,
  THROTTLE_KINDS,
  WINDOW_MINUTES,
  throttleKey,
} from '../../src/modules/admin-tenancy/domain/throttle.js';
import {
  createSession,
  resolveSession,
} from '../../src/modules/admin-tenancy/domain/session.js';

const fixture = process.env.FOUNDATION_TEST_URL;
if (!fixture)
  throw new Error(
    'FOUNDATION_TEST_URL must identify a disposable PostgreSQL 18 server'
  );
const url = new URL(fixture);
const name = 'nap_test_' + randomUUID().replaceAll('-', '');
const config = {
  database: name,
  environment: 'test',
  endpoint: url.host + '/' + name,
  maintenance: url.host + '/postgres',
  adminPassword: 'foundation-admin',
  appPassword: 'foundation-app',
};

const sessionPolicy = {
  secret: 'integration-session-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
const throttlePolicy = {
  secret: 'integration-throttle-secret-of-ample-length',
};
const policies = {
  session: sessionPolicy,
  hashing: ARGON2_MINIMUM,
  throttle: throttlePolicy,
};

const PASSWORD = 'correct-horse-battery';
const REPLACEMENT = 'a-longer-replacement-secret';
const ADDRESS = '203.0.113.7';

let handle, db, storedHash;

/**
 * Insert an active portal user holding the shared test password.
 * @param {object} [overrides]
 * @returns {Promise<{id: string, email: string}>}
 */
async function portalUser({
  status = 'active',
  mustChange = false,
  hash = null,
} = {}) {
  const email = `user-${randomUUID()}@nap.test`;
  const row = await db.one(
    `INSERT INTO admin.portal_users(email,password_hash,status,must_change_password)
     VALUES($1,$2,$3,$4) RETURNING id`,
    [email, hash ?? storedHash, status, mustChange]
  );
  return { id: row.id, email };
}

/** The stored throttle row for one key, or `null`. */
function throttleRow(key) {
  return db.oneOrNone('SELECT * FROM admin.login_throttles WHERE key_hash=$1', [
    key,
  ]);
}

/** The account-dimension throttle key for an address. */
function accountKey(email) {
  return throttleKey(throttlePolicy, THROTTLE_KINDS.account, email);
}

/** The client-address-dimension throttle key. */
function addressKey(address) {
  return throttleKey(throttlePolicy, THROTTLE_KINDS.address, address);
}

/** Attempt a login and return the error code, or `null` on success. */
async function attempt(email, password, clientAddress = ADDRESS) {
  try {
    await login(db, policies, { email, password, clientAddress });
    return null;
  } catch (error) {
    return error.code;
  }
}

/** The stored password hash for a portal user. */
async function storedFor(id) {
  const row = await db.one(
    'SELECT password_hash,must_change_password FROM admin.portal_users WHERE id=$1',
    [id]
  );
  return row;
}

/** Events recorded for one actor, oldest first. */
function eventsFor(id) {
  return db.any(
    'SELECT event_key,outcome,actor_id,details FROM admin.managed_events WHERE actor_id=$1 ORDER BY occurred_at,id',
    [id]
  );
}

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
  storedHash = await hashPassword(ARGON2_MINIMUM, PASSWORD);
}, 60000);
afterAll(async () => {
  await handle?.close();
  await using(fixture, tx =>
    tx.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [name])
  );
});

describe('login', () => {
  it('authenticates an active account and opens a resolvable session', async () => {
    const user = await portalUser();
    const { token, session } = await login(db, policies, {
      email: user.email,
      password: PASSWORD,
      clientAddress: ADDRESS,
    });
    expect(session.user).toBe(user.id);
    expect(session.restricted).toBe(false);
    const resolved = await resolveSession(db, sessionPolicy, token);
    expect(resolved.id).toBe(session.id);
    // Both events commit in the same transaction, and `now()` is the
    // transaction's start time in PostgreSQL, so `occurred_at` cannot order
    // them relative to each other — only membership is asserted here.
    const keys = await eventsFor(user.id);
    expect(keys.map(row => row.event_key).sort()).toEqual(
      ['auth.login.succeeded', 'session.created'].sort()
    );
    expect(
      keys.find(row => row.event_key === 'auth.login.succeeded').details
    ).toEqual({ method: 'password' });
  });

  it('opens a restricted session for a temporary password', async () => {
    const user = await portalUser({ mustChange: true });
    const { token, session } = await login(db, policies, {
      email: user.email,
      password: PASSWORD,
      clientAddress: ADDRESS,
    });
    expect(session.restricted).toBe(true);
    expect((await resolveSession(db, sessionPolicy, token)).restricted).toBe(
      true
    );
  });

  it('refuses every ineligible and invalid case with one code', async () => {
    const active = await portalUser();
    const locked = await portalUser({ status: 'locked' });
    const disabled = await portalUser({ status: 'disabled' });
    const archived = await portalUser();
    await db.none(
      'UPDATE admin.portal_users SET deactivated_at=now() WHERE id=$1',
      [archived.id]
    );
    for (const [label, email, password] of [
      ['wrong password', active.email, 'wrong-password-here'],
      ['unknown account', `nobody-${randomUUID()}@nap.test`, PASSWORD],
      ['unparseable account', 'not-an-address', PASSWORD],
      ['locked account', locked.email, PASSWORD],
      ['disabled account', disabled.email, PASSWORD],
      ['archived account', archived.email, PASSWORD],
    ])
      expect(
        await attempt(email, password, `198.51.100.${label.length}`),
        label
      ).toBe('UNAUTHENTICATED');
    expect(
      await db.one(
        'SELECT count(*)::int AS n FROM admin.sessions WHERE portal_user_id = ANY($1::uuid[])',
        [[active.id, locked.id, disabled.id, archived.id]]
      )
    ).toEqual({ n: 0 });
  }, 30000);

  it('distinguishes failure reasons in the event stream and nowhere else', async () => {
    const user = await portalUser({ status: 'disabled' });
    await attempt(user.email, PASSWORD, '198.51.100.21');
    await attempt(user.email, 'wrong-password-here', '198.51.100.22');
    const recorded = await eventsFor(user.id);
    expect(recorded.map(row => row.details.code)).toEqual([
      FAILURE_CODES.ineligible,
      FAILURE_CODES.badPassword,
    ]);
    for (const row of recorded)
      expect(row.details.throttle_key).toBe(accountKey(user.email));
  });
});

describe('throttling', () => {
  it('locks a key after the fifth failure inside the window', async () => {
    const user = await portalUser();
    const address = '198.51.100.31';
    for (
      let attemptNumber = 1;
      attemptNumber < MAX_FAILURES;
      attemptNumber += 1
    )
      expect(await attempt(user.email, 'wrong-password-here', address)).toBe(
        'UNAUTHENTICATED'
      );
    expect(await throttleRow(accountKey(user.email))).toMatchObject({
      failures: MAX_FAILURES - 1,
      locked_until: null,
    });
    expect(await attempt(user.email, 'wrong-password-here', address)).toBe(
      'UNAUTHENTICATED'
    );
    const locked = await throttleRow(accountKey(user.email));
    expect(locked.failures).toBe(MAX_FAILURES);
    expect(locked.locked_until.getTime()).toBeGreaterThan(Date.now());
    expect(locked.locked_until.getTime()).toBeLessThanOrEqual(
      Date.now() + LOCK_MINUTES * 60_000 + 5_000
    );
  }, 30000);

  it('refuses a locked key with the right password and without verifying it', async () => {
    const user = await portalUser();
    const address = '198.51.100.32';
    for (let n = 0; n < MAX_FAILURES; n += 1)
      await attempt(user.email, 'wrong-password-here', address);
    const before = await throttleRow(accountKey(user.email));
    try {
      await login(db, policies, {
        email: user.email,
        password: PASSWORD,
        clientAddress: address,
      });
      throw new Error('expected THROTTLED');
    } catch (error) {
      expect(error.code).toBe('THROTTLED');
      expect(error.retryAfterSeconds).toBeGreaterThan(0);
      expect(error.retryAfterSeconds).toBeLessThanOrEqual(LOCK_MINUTES * 60);
    }
    // A refused attempt is not a failure: the counter and window stand still.
    const after = await throttleRow(accountKey(user.email));
    expect(after.failures).toBe(before.failures);
    expect(after.locked_until).toEqual(before.locked_until);
    // Five failures from one address against one account lock both
    // dimensions at once, so either key may be the one the refusal names —
    // only that it names one of the two, truthfully, matters here.
    const [denied] = await db.any(
      "SELECT details FROM admin.managed_events WHERE event_key='auth.login.throttled' ORDER BY occurred_at DESC,id DESC LIMIT 1"
    );
    expect([accountKey(user.email), addressKey(address)]).toContain(
      denied.details.throttle_key
    );
    expect(denied.details.code).toBe(FAILURE_CODES.locked);
  }, 30000);

  it('enforces the account and the client address independently', async () => {
    const address = '198.51.100.33';
    const users = [];
    for (let n = 0; n < MAX_FAILURES; n += 1) users.push(await portalUser());
    for (const user of users)
      expect(await attempt(user.email, 'wrong-password-here', address)).toBe(
        'UNAUTHENTICATED'
      );
    // Five failures spread over five accounts: the address is locked, every
    // account key has seen exactly one failure and none of them is locked.
    const locked = await throttleRow(addressKey(address));
    expect(locked.failures).toBe(MAX_FAILURES);
    expect(locked.locked_until).not.toBeNull();
    for (const user of users)
      expect(await throttleRow(accountKey(user.email))).toMatchObject({
        failures: 1,
        locked_until: null,
      });
    // The address lock nonetheless refuses a correct password from it, while
    // the same account authenticates from elsewhere.
    expect(await attempt(users[0].email, PASSWORD, address)).toBe('THROTTLED');
    expect(await attempt(users[0].email, PASSWORD, '198.51.100.34')).toBeNull();
  }, 30000);

  it('counts concurrent failures exactly once each', async () => {
    const user = await portalUser();
    const address = '198.51.100.35';
    const results = await Promise.all(
      Array.from({ length: MAX_FAILURES }, () =>
        attempt(user.email, 'wrong-password-here', address)
      )
    );
    expect(results).toEqual(Array(MAX_FAILURES).fill('UNAUTHENTICATED'));
    const row = await throttleRow(accountKey(user.email));
    expect(row.failures).toBe(MAX_FAILURES);
    expect(row.locked_until).not.toBeNull();
    expect(await throttleRow(addressKey(address))).toMatchObject({
      failures: MAX_FAILURES,
    });
  }, 30000);

  it('restarts a window that has elapsed without locking', async () => {
    const user = await portalUser();
    const address = '198.51.100.36';
    await attempt(user.email, 'wrong-password-here', address);
    await db.none(
      `UPDATE admin.login_throttles
          SET window_started_at = now() - ($2::integer * interval '1 minute') - interval '1 second',
              last_failed_at = window_started_at
        WHERE key_hash=$1`,
      [accountKey(user.email), WINDOW_MINUTES]
    );
    await attempt(user.email, 'wrong-password-here', address);
    expect(await throttleRow(accountKey(user.email))).toMatchObject({
      failures: 1,
      locked_until: null,
    });
  }, 30000);

  it('does not re-lock on the single attempt after a lock expires', async () => {
    const user = await portalUser();
    const address = '198.51.100.37';
    for (let n = 0; n < MAX_FAILURES; n += 1)
      await attempt(user.email, 'wrong-password-here', address);
    await db.none(
      "UPDATE admin.login_throttles SET locked_until = now() - interval '1 second'",
      []
    );
    expect(await attempt(user.email, 'wrong-password-here', address)).toBe(
      'UNAUTHENTICATED'
    );
    expect(await throttleRow(accountKey(user.email))).toMatchObject({
      failures: 1,
      locked_until: null,
    });
  }, 30000);

  it('clears the account key on success and keeps the address key', async () => {
    const user = await portalUser();
    const address = '198.51.100.38';
    await attempt(user.email, 'wrong-password-here', address);
    expect(await throttleRow(accountKey(user.email))).not.toBeNull();
    expect(await attempt(user.email, PASSWORD, address)).toBeNull();
    expect(await throttleRow(accountKey(user.email))).toBeNull();
    expect(await throttleRow(addressKey(address))).toMatchObject({
      failures: 1,
    });
  }, 30000);

  it('deletes spent rows older than the retention window and keeps live locks', async () => {
    const user = await portalUser();
    const address = '198.51.100.39';
    const stale = 'stale-' + randomUUID();
    const held = 'held-' + randomUUID();
    await db.none(
      `INSERT INTO admin.login_throttles(key_hash,failures,window_started_at,last_failed_at,locked_until)
       VALUES ($1,3,now() - ($3::integer * interval '1 hour'),now() - ($3::integer * interval '1 hour'),NULL),
              ($2,5,now() - ($3::integer * interval '1 hour'),now() - ($3::integer * interval '1 hour'),now() + interval '5 minutes')`,
      [stale, held, RETENTION_HOURS + 1]
    );
    await attempt(user.email, 'wrong-password-here', address);
    expect(await throttleRow(stale)).toBeNull();
    expect(await throttleRow(held)).not.toBeNull();
  }, 30000);
});

describe('rehashing', () => {
  it('replaces a digest stored under weaker parameters and keeps the account usable', async () => {
    const user = await portalUser();
    const before = (await storedFor(user.id)).password_hash;
    const raised = {
      ...policies,
      hashing: { ...ARGON2_MINIMUM, memoryKib: 32768 },
    };
    await login(db, raised, {
      email: user.email,
      password: PASSWORD,
      clientAddress: '198.51.100.41',
    });
    const after = (await storedFor(user.id)).password_hash;
    expect(after).not.toBe(before);
    expect(after).toContain('m=32768');
    expect(await verifyPassword(after, PASSWORD)).toBe(true);
  }, 30000);

  it('leaves a stronger stored digest alone under weaker configuration', async () => {
    const strong = await hashPassword(
      { ...ARGON2_MINIMUM, memoryKib: 32768 },
      PASSWORD
    );
    const user = await portalUser({ hash: strong });
    await login(db, policies, {
      email: user.email,
      password: PASSWORD,
      clientAddress: '198.51.100.42',
    });
    expect((await storedFor(user.id)).password_hash).toBe(strong);
  }, 30000);
});

describe('password change', () => {
  /** Log in and return the caller's token and session view. */
  function signIn(user, address) {
    return login(db, policies, {
      email: user.email,
      password: PASSWORD,
      clientAddress: address,
    });
  }

  it('replaces the hash, clears the flag, revokes others, and rotates this one', async () => {
    const user = await portalUser({ mustChange: true });
    const other = await createSession(db, sessionPolicy, {
      portalUserId: user.id,
    });
    const own = await signIn(user, '198.51.100.51');
    const changed = await changePassword(db, policies, {
      session: own.session,
      token: own.token,
      currentPassword: PASSWORD,
      newPassword: REPLACEMENT,
    });
    expect(changed.session.id).toBe(own.session.id);
    expect(changed.session.restricted).toBe(false);
    expect(changed.token).not.toBe(own.token);

    const stored = await storedFor(user.id);
    expect(stored.must_change_password).toBe(false);
    expect(await verifyPassword(stored.password_hash, REPLACEMENT)).toBe(true);
    expect(await verifyPassword(stored.password_hash, PASSWORD)).toBe(false);

    // The rotated session survives, its prior token does not, and every other
    // session the old password could have opened is gone.
    expect((await resolveSession(db, sessionPolicy, changed.token)).id).toBe(
      own.session.id
    );
    await expect(
      resolveSession(db, sessionPolicy, own.token)
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    await expect(
      resolveSession(db, sessionPolicy, other.token)
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    const keys = (await eventsFor(user.id)).map(row => row.event_key);
    expect(keys).toContain('auth.password.changed');
    expect(keys).toContain('session.revoked');
    expect(keys).toContain('session.rotated');
    const [record] = await db.any(
      "SELECT details FROM admin.managed_events WHERE event_key='auth.password.changed' AND actor_id=$1",
      [user.id]
    );
    expect(record.details).toEqual({ forced: true });

    // The new password authenticates and no longer restricts the session.
    const again = await login(db, policies, {
      email: user.email,
      password: REPLACEMENT,
      clientAddress: '198.51.100.52',
    });
    expect(again.session.restricted).toBe(false);
  }, 60000);

  it('preserves the old hash and flag when the event store rejects the write', async () => {
    const user = await portalUser({ mustChange: true });
    const own = await signIn(user, '198.51.100.53');
    const other = await createSession(db, sessionPolicy, {
      portalUserId: user.id,
    });
    const append = db.managed_events.append.bind(db.managed_events);
    db.managed_events.append = async (event, options) => {
      if (event.event_key === 'auth.password.changed')
        throw Object.assign(new Error('audit down'), {
          code: 'AUDIT_UNAVAILABLE',
        });
      return append(event, options);
    };
    try {
      await expect(
        changePassword(db, policies, {
          session: own.session,
          token: own.token,
          currentPassword: PASSWORD,
          newPassword: REPLACEMENT,
        })
      ).rejects.toMatchObject({ code: 'AUDIT_UNAVAILABLE' });
    } finally {
      db.managed_events.append = append;
    }
    const stored = await storedFor(user.id);
    expect(stored.must_change_password).toBe(true);
    expect(await verifyPassword(stored.password_hash, PASSWORD)).toBe(true);
    // The revocation and the rotation rolled back with the hash.
    expect((await resolveSession(db, sessionPolicy, own.token)).id).toBe(
      own.session.id
    );
    expect((await resolveSession(db, sessionPolicy, other.token)).id).toBe(
      other.session.id
    );
  }, 60000);

  it('refuses a wrong current password, a short replacement, and a repeat', async () => {
    const user = await portalUser();
    const own = await signIn(user, '198.51.100.54');
    const cases = [
      ['not-the-password', REPLACEMENT, 'UNAUTHENTICATED'],
      [PASSWORD, 'too-short', 'INVALID_INPUT'],
      [PASSWORD, PASSWORD, 'INVALID_INPUT'],
    ];
    for (const [currentPassword, newPassword, code] of cases)
      await expect(
        changePassword(db, policies, {
          session: own.session,
          token: own.token,
          currentPassword,
          newPassword,
        })
      ).rejects.toMatchObject({ code });
    expect(
      await verifyPassword((await storedFor(user.id)).password_hash, PASSWORD)
    ).toBe(true);
  }, 60000);

  it('refuses an account disabled after its session resolved', async () => {
    const user = await portalUser();
    const own = await signIn(user, '198.51.100.55');
    await db.none(
      "UPDATE admin.portal_users SET status='disabled' WHERE id=$1",
      [user.id]
    );
    await expect(
      changePassword(db, policies, {
        session: own.session,
        token: own.token,
        currentPassword: PASSWORD,
        newPassword: REPLACEMENT,
      })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(
      await verifyPassword((await storedFor(user.id)).password_hash, PASSWORD)
    ).toBe(true);
  }, 30000);
});

describe('stored and recorded secrets', () => {
  it('leaves no password, hash, raw address, or raw email in the event stream', async () => {
    const user = await portalUser({ mustChange: true });
    const own = await login(db, policies, {
      email: user.email,
      password: PASSWORD,
      clientAddress: ADDRESS,
    });
    await changePassword(db, policies, {
      session: own.session,
      token: own.token,
      currentPassword: PASSWORD,
      newPassword: REPLACEMENT,
    });
    for (let n = 0; n < MAX_FAILURES + 1; n += 1)
      await attempt(user.email, 'wrong-password-here', ADDRESS);
    const rows = await db.any('SELECT * FROM admin.managed_events');
    const dump = JSON.stringify(rows);
    for (const secret of [
      PASSWORD,
      REPLACEMENT,
      user.email,
      ADDRESS,
      '$argon2id$',
      'argon2',
    ])
      expect(dump, secret).not.toContain(secret);
  }, 60000);

  it('stores no plaintext password on the account', async () => {
    const user = await portalUser();
    const stored = await storedFor(user.id);
    expect(stored.password_hash).not.toContain(PASSWORD);
    expect(stored.password_hash).toMatch(/^\$argon2id\$/);
  });
});
