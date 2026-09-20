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
  MAX_ACTIVE_SESSIONS,
  REVOCATION_CODES,
  createSession,
  createSessionToken,
  hashSessionToken,
  logoutSession,
  resolveSession,
  revokeSession,
  revokeSessionsForUser,
  rotateSession,
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
const policy = {
  secret: 'integration-session-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
let handle, db;

/**
 * Insert an active portal user.
 * @param {object} [overrides]
 * @returns {Promise<string>} The portal-user UUID.
 */
async function portalUser({ status = 'active', mustChange = false } = {}) {
  const row = await db.one(
    `INSERT INTO admin.portal_users(email,password_hash,status,must_change_password)
     VALUES($1,'argon2id$placeholder',$2,$3) RETURNING id`,
    [`user-${randomUUID()}@nap.test`, status, mustChange]
  );
  return row.id;
}

/**
 * Insert an active ordinary tenant.
 * @returns {Promise<string>} The tenant UUID.
 */
async function tenant() {
  const row = await db.one(
    "INSERT INTO admin.tenants(tenant_code,name,status) VALUES($1,'Tenant','active') RETURNING id",
    ['T-' + randomUUID().slice(0, 8)]
  );
  return row.id;
}

/**
 * The owning tenant. A partial unique index permits exactly one row with
 * `is_napsoft`, so every test that needs it shares this one.
 * @returns {Promise<string>} The Napsoft tenant UUID.
 */
async function napsoftTenant() {
  const existing = await db.oneOrNone(
    'SELECT id FROM admin.tenants WHERE is_napsoft'
  );
  if (existing) return existing.id;
  const row = await db.one(
    "INSERT INTO admin.tenants(tenant_code,name,status,is_napsoft) VALUES('NAP','Napsoft','active',true) RETURNING id"
  );
  return row.id;
}

/**
 * Read the stored row for a session, archived or not.
 * @param {string} id
 * @returns {Promise<object>}
 */
function stored(id) {
  return db.one('SELECT * FROM admin.sessions WHERE id=$1', [id]);
}

/**
 * Read the events recorded for a session, oldest first.
 * @param {string} id
 * @returns {Promise<object[]>}
 */
function eventsFor(id) {
  return db.any(
    'SELECT event_key,outcome,actor_id,tenant_id,details FROM admin.managed_events WHERE session_id=$1 ORDER BY occurred_at,id',
    [id]
  );
}

/**
 * Read the cache revision recorded for a session.
 * @param {string} id
 * @returns {Promise<string>} Decimal revision, `'0'` when unstored.
 */
async function revisionOf(id) {
  const row = await db.oneOrNone(
    "SELECT revision::text AS revision FROM admin.cache_revisions WHERE domain='session' AND entity=$1",
    [id]
  );
  return row?.revision ?? '0';
}

/**
 * Build an authorization scope for a platform operator.
 * @param {string[]} deniedTenantIds
 * @returns {object}
 */
function operatorScope(deniedTenantIds = []) {
  return {
    platformPortalUserRead: true,
    tenantIds: '*',
    deniedTenantIds,
    archiveManagement: false,
  };
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
}, 30000);
afterAll(async () => {
  await handle?.close();
  await using(fixture, tx =>
    tx.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [name])
  );
});

describe('creation', () => {
  it('creates a session for the verified user, stores only the hash, and records it', async () => {
    const user = await portalUser();
    const created = await createSession(db, policy, {
      portalUserId: user,
      method: 'password',
    });
    expect(created.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.session.user).toBe(user);
    expect(created.session.tenant).toBeNull();
    expect(created.session.accessMode).toBe('normal');
    expect(JSON.stringify(created.session)).not.toContain(created.token);

    const row = await stored(created.session.id);
    expect(row.token_hash).toBe(hashSessionToken(policy, created.token));
    expect(row.token_hash).not.toContain(created.token);
    const lifetime = row.absolute_expires_at - row.created_at;
    expect(Math.round(lifetime / 3_600_000)).toBe(12);
    expect(Math.round((row.idle_expires_at - row.created_at) / 60_000)).toBe(
      30
    );

    expect(await eventsFor(created.session.id)).toEqual([
      {
        event_key: 'session.created',
        outcome: 'succeeded',
        actor_id: user,
        tenant_id: null,
        details: { method: 'password' },
      },
    ]);
    expect(await revisionOf(created.session.id)).toBe('1');
  });

  it('keeps ten live sessions by revoking the oldest', async () => {
    const user = await portalUser();
    const created = [];
    for (let index = 0; index < MAX_ACTIVE_SESSIONS + 2; index += 1)
      created.push(await createSession(db, policy, { portalUserId: user }));

    const live = await db.any(
      'SELECT id FROM admin.sessions WHERE portal_user_id=$1 AND deactivated_at IS NULL',
      [user]
    );
    expect(live).toHaveLength(MAX_ACTIVE_SESSIONS);
    for (const evicted of created.slice(0, 2)) {
      expect((await stored(evicted.session.id)).deactivated_at).not.toBeNull();
      expect(await eventsFor(evicted.session.id)).toContainEqual(
        expect.objectContaining({
          event_key: 'session.revoked',
          details: { code: REVOCATION_CODES.sessionCap },
        })
      );
      await expect(
        resolveSession(db, policy, evicted.token)
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    }
  });

  it('does not count an idle-expired session against the cap', async () => {
    const user = await portalUser();
    const oldest = await createSession(db, policy, { portalUserId: user });
    const abandoned = [];
    for (let index = 0; index < MAX_ACTIVE_SESSIONS - 1; index += 1)
      abandoned.push(await createSession(db, policy, { portalUserId: user }));
    // Every session but the oldest has gone idle. The user still holds one
    // usable session, so a new login needs no room made for it.
    await db.none(
      "UPDATE admin.sessions SET idle_expires_at=now() - interval '1 second' WHERE id IN ($1:csv)",
      [abandoned.map(session => session.session.id)]
    );

    await createSession(db, policy, { portalUserId: user });

    expect((await stored(oldest.session.id)).deactivated_at).toBeNull();
    expect((await resolveSession(db, policy, oldest.token)).id).toBe(
      oldest.session.id
    );
    expect(
      (await eventsFor(oldest.session.id)).map(event => event.event_key)
    ).not.toContain('session.revoked');
  });

  it('rolls the session back with the caller transaction', async () => {
    const user = await portalUser();
    let id;
    await expect(
      db.tx(async tx => {
        const created = await createSession(
          db,
          policy,
          { portalUserId: user },
          { tx }
        );
        id = created.session.id;
        throw new Error('login failed after the session was created');
      })
    ).rejects.toThrow();
    expect(
      await db.oneOrNone('SELECT id FROM admin.sessions WHERE id=$1', [id])
    ).toBeNull();
  });

  it('refuses an input that is not a portal-user UUID', async () => {
    await expect(
      createSession(db, policy, { portalUserId: 'not-a-uuid' })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('resolution', () => {
  it('resolves a live session and reports the restriction from the account', async () => {
    const user = await portalUser({ mustChange: true });
    const created = await createSession(db, policy, { portalUserId: user });
    const resolved = await resolveSession(db, policy, created.token);
    expect(resolved.id).toBe(created.session.id);
    expect(resolved.restricted).toBe(true);

    await db.none(
      'UPDATE admin.portal_users SET must_change_password=false WHERE id=$1',
      [user]
    );
    expect((await resolveSession(db, policy, created.token)).restricted).toBe(
      false
    );
  });

  it('refuses an unknown, tampered, archived, or revoked token alike', async () => {
    const user = await portalUser();
    const created = await createSession(db, policy, { portalUserId: user });
    const tampered = `${created.token.slice(0, 42)}A`;
    for (const token of [createSessionToken(), tampered, 'short', ''])
      await expect(resolveSession(db, policy, token)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });

    await logoutSession(db, policy, created.token);
    await expect(
      resolveSession(db, policy, created.token)
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('archives and records a session past its idle limit', async () => {
    const user = await portalUser();
    const created = await createSession(db, policy, { portalUserId: user });
    await db.none(
      "UPDATE admin.sessions SET idle_expires_at=now() - interval '1 second' WHERE id=$1",
      [created.session.id]
    );
    await expect(
      resolveSession(db, policy, created.token)
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect((await stored(created.session.id)).deactivated_at).not.toBeNull();
    expect(await eventsFor(created.session.id)).toContainEqual(
      expect.objectContaining({ event_key: 'session.expired', details: {} })
    );
    expect(await revisionOf(created.session.id)).toBe('2');
  });

  it('archives a session past its absolute limit even while recently seen', async () => {
    const user = await portalUser();
    const created = await createSession(db, policy, { portalUserId: user });
    await db.none(
      `UPDATE admin.sessions
          SET absolute_expires_at=now() - interval '1 second',
              idle_expires_at=now() - interval '1 second'
        WHERE id=$1`,
      [created.session.id]
    );
    await expect(
      resolveSession(db, policy, created.token)
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect((await stored(created.session.id)).deactivated_at).not.toBeNull();
  });

  it('revokes the session of an account that is no longer eligible', async () => {
    for (const change of [
      "UPDATE admin.portal_users SET status='disabled' WHERE id=$1",
      'UPDATE admin.portal_users SET deactivated_at=now() WHERE id=$1',
    ]) {
      const user = await portalUser();
      const created = await createSession(db, policy, { portalUserId: user });
      await db.none(change, [user]);
      await expect(
        resolveSession(db, policy, created.token)
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      expect((await stored(created.session.id)).deactivated_at).not.toBeNull();
      expect(await eventsFor(created.session.id)).toContainEqual(
        expect.objectContaining({
          event_key: 'session.revoked',
          details: { code: REVOCATION_CODES.accountIneligible },
        })
      );
    }
  });

  it('extends idle expiry at most once every five minutes', async () => {
    const user = await portalUser();
    const created = await createSession(db, policy, { portalUserId: user });
    const before = await stored(created.session.id);

    await resolveSession(db, policy, created.token);
    expect((await stored(created.session.id)).last_seen_at).toEqual(
      before.last_seen_at
    );

    await db.none(
      "UPDATE admin.sessions SET last_seen_at=now() - interval '6 minutes' WHERE id=$1",
      [created.session.id]
    );
    await resolveSession(db, policy, created.token);
    const after = await stored(created.session.id);
    expect(after.last_seen_at.getTime()).toBeGreaterThan(
      before.last_seen_at.getTime() - 6 * 60_000
    );
    expect(after.idle_expires_at.getTime()).toBeGreaterThan(
      before.idle_expires_at.getTime()
    );
    expect(after.idle_expires_at.getTime()).toBeLessThanOrEqual(
      after.absolute_expires_at.getTime()
    );
  });

  it('never extends idle expiry past absolute expiry', async () => {
    const user = await portalUser();
    const created = await createSession(db, policy, { portalUserId: user });
    await db.none(
      `UPDATE admin.sessions
          SET absolute_expires_at=now() + interval '2 minutes',
              idle_expires_at=now() + interval '1 minute',
              last_seen_at=now() - interval '6 minutes'
        WHERE id=$1`,
      [created.session.id]
    );
    const resolved = await resolveSession(db, policy, created.token);
    expect(new Date(resolved.idleExpiresAt).getTime()).toBeLessThanOrEqual(
      new Date(resolved.absoluteExpiresAt).getTime()
    );
  });
});

describe('rotation', () => {
  it('invalidates the prior token the moment the new one is issued', async () => {
    const user = await portalUser();
    const created = await createSession(db, policy, { portalUserId: user });
    const rotated = await rotateSession(db, policy, created.token);
    expect(rotated.token).not.toBe(created.token);
    expect(rotated.session.id).toBe(created.session.id);
    expect((await resolveSession(db, policy, rotated.token)).id).toBe(
      created.session.id
    );
    await expect(
      resolveSession(db, policy, created.token)
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(await eventsFor(created.session.id)).toContainEqual(
      expect.objectContaining({ event_key: 'session.rotated' })
    );
    expect(await revisionOf(created.session.id)).toBe('2');
  });

  it('produces exactly one winner for concurrent rotations of the same token', async () => {
    const user = await portalUser();
    const created = await createSession(db, policy, { portalUserId: user });
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () => rotateSession(db, policy, created.token))
    );
    const winners = attempts.filter(result => result.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    for (const loser of attempts.filter(r => r.status === 'rejected'))
      expect(['UNAUTHENTICATED', 'CONFLICT']).toContain(loser.reason.code);
    expect((await resolveSession(db, policy, winners[0].value.token)).id).toBe(
      created.session.id
    );
  });

  it('preserves tenant and support context across a rotation', async () => {
    const user = await portalUser();
    const operator = await portalUser();
    const target = await tenant();
    const created = await createSession(db, policy, { portalUserId: user });
    await db.none(
      `UPDATE admin.sessions
          SET tenant_id=$2, access_mode='support', effective_user_id=$3,
              access_reason='investigating a reported posting error',
              access_expires_at=now() + interval '30 minutes'
        WHERE id=$1`,
      [created.session.id, target, operator]
    );
    const rotated = await rotateSession(db, policy, created.token);
    expect(rotated.session).toMatchObject({
      tenant: target,
      accessMode: 'support',
      effectiveUser: operator,
      accessReason: 'investigating a reported posting error',
    });
    const resolved = await resolveSession(db, policy, rotated.token);
    expect(resolved.tenant).toBe(target);
    expect(resolved.accessMode).toBe('support');
  });

  it('refuses to rotate an expired or revoked token', async () => {
    const user = await portalUser();
    const expired = await createSession(db, policy, { portalUserId: user });
    await db.none(
      "UPDATE admin.sessions SET idle_expires_at=now() - interval '1 second' WHERE id=$1",
      [expired.session.id]
    );
    await expect(
      rotateSession(db, policy, expired.token)
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });

    const revoked = await createSession(db, policy, { portalUserId: user });
    await logoutSession(db, policy, revoked.token);
    await expect(
      rotateSession(db, policy, revoked.token)
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

describe('revocation', () => {
  it('logs out once and tolerates the repeat', async () => {
    const user = await portalUser();
    const created = await createSession(db, policy, { portalUserId: user });
    expect(await logoutSession(db, policy, created.token)).toEqual({
      revoked: true,
    });
    expect(await logoutSession(db, policy, created.token)).toEqual({
      revoked: false,
    });
    expect(await logoutSession(db, policy, createSessionToken())).toEqual({
      revoked: false,
    });
    expect(
      (await eventsFor(created.session.id)).filter(
        event => event.event_key === 'session.revoked'
      )
    ).toHaveLength(1);
  });

  it('permits at most one state change for concurrent revocations', async () => {
    const user = await portalUser();
    const created = await createSession(db, policy, { portalUserId: user });
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, () => logoutSession(db, policy, created.token))
    );
    const changed = attempts.filter(
      result => result.status === 'fulfilled' && result.value.revoked
    );
    expect(changed).toHaveLength(1);
  });

  it("lets a user revoke their own session and refuses another user's", async () => {
    const owner = await portalUser();
    const stranger = await portalUser();
    const created = await createSession(db, policy, { portalUserId: owner });
    await expect(
      revokeSession(db, { actorId: stranger }, created.session.id)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await stored(created.session.id)).deactivated_at).toBeNull();

    expect(
      await revokeSession(db, { actorId: owner }, created.session.id)
    ).toEqual({ revoked: true });
    expect(
      await revokeSession(db, { actorId: owner }, created.session.id)
    ).toEqual({ revoked: false });
  });

  it('lets support revoke platform and non-Napsoft sessions but not Napsoft ones', async () => {
    const napsoft = await napsoftTenant();
    const other = await tenant();
    const operator = await portalUser();
    const support = operatorScope([napsoft]);

    const platform = await createSession(db, policy, {
      portalUserId: await portalUser(),
    });
    expect(
      await revokeSession(
        db,
        { actorId: operator, scope: support },
        platform.session.id
      )
    ).toEqual({ revoked: true });

    const permitted = await createSession(db, policy, {
      portalUserId: await portalUser(),
    });
    await db.none('UPDATE admin.sessions SET tenant_id=$2 WHERE id=$1', [
      permitted.session.id,
      other,
    ]);
    expect(
      await revokeSession(
        db,
        { actorId: operator, scope: support },
        permitted.session.id
      )
    ).toEqual({ revoked: true });

    const denied = await createSession(db, policy, {
      portalUserId: await portalUser(),
    });
    await db.none('UPDATE admin.sessions SET tenant_id=$2 WHERE id=$1', [
      denied.session.id,
      napsoft,
    ]);
    await expect(
      revokeSession(
        db,
        { actorId: operator, scope: support },
        denied.session.id
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await stored(denied.session.id)).deactivated_at).toBeNull();
    expect(
      await revokeSession(
        db,
        { actorId: operator, scope: operatorScope() },
        denied.session.id
      )
    ).toEqual({ revoked: true });
  });

  it('refuses a missing session exactly as it refuses a denied one', async () => {
    const operator = await portalUser();
    const napsoft = await napsoftTenant();
    const denied = await createSession(db, policy, {
      portalUserId: await portalUser(),
    });
    await db.none('UPDATE admin.sessions SET tenant_id=$2 WHERE id=$1', [
      denied.session.id,
      napsoft,
    ]);
    const support = operatorScope([napsoft]);
    const missing = await revokeSession(
      db,
      { actorId: operator, scope: support },
      randomUUID()
    ).catch(error => error.code);
    const refused = await revokeSession(
      db,
      { actorId: operator, scope: support },
      denied.session.id
    ).catch(error => error.code);
    expect(missing).toBe('FORBIDDEN');
    expect(refused).toBe('FORBIDDEN');
  });

  it('revokes every other session for a password change', async () => {
    const user = await portalUser();
    const kept = await createSession(db, policy, { portalUserId: user });
    const others = [
      await createSession(db, policy, { portalUserId: user }),
      await createSession(db, policy, { portalUserId: user }),
    ];
    const result = await revokeSessionsForUser(db, {
      portalUserId: user,
      exceptSessionId: kept.session.id,
      code: REVOCATION_CODES.passwordChanged,
    });
    expect(result.revoked.sort()).toEqual(
      others.map(other => other.session.id).sort()
    );
    expect((await resolveSession(db, policy, kept.token)).id).toBe(
      kept.session.id
    );
    for (const other of others) {
      await expect(
        resolveSession(db, policy, other.token)
      ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
      expect(await eventsFor(other.session.id)).toContainEqual(
        expect.objectContaining({
          event_key: 'session.revoked',
          details: { code: REVOCATION_CODES.passwordChanged },
        })
      );
    }
  });

  it('refuses an unknown revocation code or identifier', async () => {
    for (const bad of [
      { portalUserId: 'not-a-uuid' },
      { portalUserId: randomUUID(), exceptSessionId: 'nope' },
      { portalUserId: randomUUID(), code: 'because' },
    ])
      await expect(revokeSessionsForUser(db, bad)).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
  });
});

describe('credentials', () => {
  it('records no token or token hash in any session event', async () => {
    const user = await portalUser();
    const created = await createSession(db, policy, { portalUserId: user });
    const rotated = await rotateSession(db, policy, created.token);
    await logoutSession(db, policy, rotated.token);
    const stream = JSON.stringify(
      await db.any('SELECT * FROM admin.managed_events WHERE session_id=$1', [
        created.session.id,
      ])
    );
    for (const secret of [
      created.token,
      rotated.token,
      hashSessionToken(policy, created.token),
      hashSessionToken(policy, rotated.token),
    ])
      expect(stream).not.toContain(secret);
  });

  it('operates entirely under the nap-app runtime role', async () => {
    expect((await db.one('SELECT current_user AS user')).user).toBe('nap-app');
  });
});
