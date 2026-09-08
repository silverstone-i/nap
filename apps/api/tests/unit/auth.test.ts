/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  authConfiguration,
  passwordOptions,
} from '../../src/util/authConfig.js';
import { bootstrapConfiguration } from '../../src/services/bootstrap.js';
import { hashPassword, verifyPassword } from '../../src/util/password.js';
import {
  cookieOptions,
  matchesSecret,
  readReference,
  secretDigest,
  sessionCookieName,
  signReference,
} from '../../src/util/sessionCookie.js';
import { throttleKeys } from '../../src/services/loginThrottle.js';
import { authEnv } from '../fixtures/authDatabase.js';

it('uses accepted defaults and rejects missing, sample, or short secrets and invalid bounds', () => {
  const config = authConfiguration({ ...authEnv, COOKIE_SECURE: undefined });
  expect(config).toMatchObject({
    idleMinutes: 30,
    absoluteHours: 12,
    secure: true,
    sameSite: 'lax',
    password: { memoryCost: 19456, timeCost: 2, parallelism: 1 },
  });
  expect(cookieOptions(config)).toEqual({
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
  });
  for (const env of [
    { ...authEnv, SESSION_SECRET: undefined },
    { ...authEnv, SESSION_SECRET: 'change-me'.repeat(5) },
    { ...authEnv, AUTH_THROTTLE_SECRET: 'short' },
    { ...authEnv, SESSION_IDLE_MINUTES: '0' },
    { ...authEnv, COOKIE_SAMESITE: 'none' },
  ])
    expect(() => authConfiguration(env)).toThrow();
  expect(() => passwordOptions({ ARGON2_MEMORY_KIB: '1024' })).toThrow();
});

it('validates root seed arguments and refuses sample and short passwords', () => {
  expect(bootstrapConfiguration(authEnv, []).reset).toBe(false);
  expect(
    bootstrapConfiguration(
      { ...authEnv, ROOT_EMAIL: '  Root@Example.COM  ' },
      []
    ).email
  ).toBe('root@example.com');
  expect(() =>
    bootstrapConfiguration({ ...authEnv, ROOT_EMAIL: ' invalid-email ' }, [])
  ).toThrow();
  expect(bootstrapConfiguration(authEnv, ['--reset-root-password']).reset).toBe(
    true
  );
  expect(() => bootstrapConfiguration(authEnv, ['--force'])).toThrow();
  expect(() =>
    bootstrapConfiguration(
      { ...authEnv, ROOT_PASSWORD: 'change-me-change-me' },
      []
    )
  ).toThrow();
  expect(() =>
    bootstrapConfiguration({ ...authEnv, ROOT_PASSWORD: 'short' }, [])
  ).toThrow();
});

it('hashes and checks Argon2id passwords and compares only valid digests', async () => {
  const hash = await hashPassword(authEnv.ROOT_PASSWORD, passwordOptions({}));
  expect(hash).toMatch(/^\$argon2id\$/);
  expect(await verifyPassword(hash, authEnv.ROOT_PASSWORD)).toBe(true);
  expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
  expect(matchesSecret('secret', secretDigest('secret'))).toBe(true);
  expect(matchesSecret('other', secretDigest('secret'))).toBe(false);
  expect(matchesSecret('secret', 'invalid')).toBe(false);
});

it('accepts only the signed session reference and privacy-separates throttle keys', async () => {
  const id = randomUUID();
  const secret = 'a'.repeat(64);
  const token = await signReference(id, secret, authEnv.SESSION_SECRET);
  expect(
    await readReference(sessionCookieName + '=' + token, authEnv.SESSION_SECRET)
  ).toEqual({ id, secret });
  expect(
    await readReference(sessionCookieName + '=' + token, 'different-key')
  ).toBeUndefined();
  expect(
    await readReference(undefined, authEnv.SESSION_SECRET)
  ).toBeUndefined();
  const keys = throttleKeys('same', 'same', authEnv.AUTH_THROTTLE_SECRET);
  expect(keys[0]).not.toBe(keys[1]);
  expect(keys.every(key => /^[a-f0-9]{64}$/.test(key))).toBe(true);
});
