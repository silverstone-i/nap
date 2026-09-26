/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { supersede } from '../../src/application/sync/engine.js';
import { parseSnapshot } from '../../src/application/sync/snapshots.js';
import { requestPortalAccess } from '../../src/modules/cell-tenancy/domain/portalAccess.js';
import { ARGON2_MINIMUM } from '../../src/modules/admin-tenancy/domain/password.js';

const row = (topic, entity_id, revision) => ({
  id: randomUUID(),
  topic,
  entity_id,
  revision,
});

describe('supersede (I0004-R004, R005, R009)', () => {
  it('keeps the highest revision per entity and orders by topic, then revision', () => {
    const a = randomUUID();
    const t = randomUUID();
    const rows = [
      row('entitlement', randomUUID(), 1),
      row('membership', a, 2),
      row('membership', a, 3),
      row('tenant', t, 5),
      row('membership', a, 1),
    ];
    const { live, superseded } = supersede(rows);
    expect(live.map(r => [r.topic, r.revision])).toEqual([
      ['tenant', 5],
      ['membership', 3],
      ['entitlement', 1],
    ]);
    expect(superseded.map(r => r.revision).sort()).toEqual([1, 2]);
  });
});

describe('parseSnapshot (I0004-R013, R023)', () => {
  it('rejects extra fields and a portal-access request holding a plaintext password', () => {
    const base = {
      tenant_id: randomUUID(),
      member_id: randomUUID(),
      member_type: 'client',
      email: 'a@nap.test',
      enabled: true,
      password_hash: '$argon2id$v=19$m=1,t=1,p=1$x$y',
    };
    expect(parseSnapshot('portal_access', base)).not.toBeNull();
    expect(
      parseSnapshot('portal_access', { ...base, password: 'plain' })
    ).toBeNull();
    expect(
      parseSnapshot('portal_access', { ...base, enabled: false })
    ).toBeNull();
    expect(
      parseSnapshot('entitlement', {
        id: randomUUID(),
        tenant_id: randomUUID(),
        module: 'm',
        enabled: true,
        revision: 1,
      })
    ).toBeNull();
  });
});

describe('requestPortalAccess (I0004-R020–R023)', () => {
  function fakeTx() {
    const inserted = [];
    return {
      inserted,
      one: vi.fn(async () => ({})),
      outbox: {
        nextRevision: vi.fn(async () => 1),
        insert: vi.fn(async dto => inserted.push(dto)),
      },
    };
  }
  const valid = () => ({
    tenantId: randomUUID(),
    memberId: randomUUID(),
    memberType: 'employee',
    email: 'Person@Nap.Test',
    enabled: true,
    temporaryPassword: 'temporary-secret',
  });
  const options = { hashingPolicy: ARGON2_MINIMUM };

  it.each([
    ['an unknown member type', { memberType: 'robot' }],
    ['an invalid email', { email: 'not-an-email' }],
    [
      'a missing temporary password when enabling',
      { temporaryPassword: undefined },
    ],
    ['a temporary password when disabling', { enabled: false }],
  ])('rejects %s with INVALID_INPUT before inserting', async (_, change) => {
    const tx = fakeTx();
    await expect(
      requestPortalAccess(tx, { ...valid(), ...change }, options)
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(tx.inserted).toHaveLength(0);
  });

  it('writes only the hash, never the plaintext', async () => {
    const tx = fakeTx();
    const input = valid();
    await requestPortalAccess(tx, input, options);
    const [dto] = tx.inserted;
    expect(dto).toMatchObject({
      topic: 'portal_access',
      entity_id: input.memberId,
      revision: 1,
    });
    expect(Object.keys(dto.payload).sort()).toEqual([
      'email',
      'enabled',
      'member_id',
      'member_type',
      'password_hash',
      'tenant_id',
    ]);
    expect(dto.payload.email).toBe('person@nap.test');
    expect(JSON.stringify(dto)).not.toContain(input.temporaryPassword);
  });
});
