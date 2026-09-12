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
  const config = authConfiguration({
    ...authEnv,
    COOKIE_SECURE_TEST: undefined,
  });
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
    { ...authEnv, SESSION_SECRET_TEST: undefined },
    { ...authEnv, SESSION_SECRET_TEST: 'change-me'.repeat(5) },
    { ...authEnv, AUTH_THROTTLE_SECRET_TEST: 'short' },
    { ...authEnv, SESSION_IDLE_MINUTES: '0' },
    { ...authEnv, COOKIE_SAMESITE_TEST: 'none' },
  ])
    expect(() => authConfiguration(env)).toThrow();
  expect(() => passwordOptions({ ARGON2_MEMORY_KIB: '1024' })).toThrow();
});

it('validates root seed arguments and refuses sample and short passwords', () => {
  expect(bootstrapConfiguration(authEnv, []).reset).toBe(false);
  expect(
    bootstrapConfiguration(
      { ...authEnv, ROOT_EMAIL_TEST: '  Root@Example.COM  ' },
      []
    ).email
  ).toBe('root@example.com');
  expect(() =>
    bootstrapConfiguration(
      { ...authEnv, ROOT_EMAIL_TEST: ' invalid-email ' },
      []
    )
  ).toThrow();
  expect(bootstrapConfiguration(authEnv, ['--reset-root-password']).reset).toBe(
    true
  );
  expect(() => bootstrapConfiguration(authEnv, ['--force'])).toThrow();
  expect(() =>
    bootstrapConfiguration(
      { ...authEnv, ROOT_PASSWORD_TEST: 'change-me-change-me' },
      []
    )
  ).toThrow();
  expect(() =>
    bootstrapConfiguration({ ...authEnv, ROOT_PASSWORD_TEST: 'short' }, [])
  ).toThrow();
});

it('hashes and checks Argon2id passwords and compares only valid digests', async () => {
  const hash = await hashPassword(
    authEnv.ROOT_PASSWORD_TEST,
    passwordOptions({})
  );
  expect(hash).toMatch(/^\$argon2id\$/);
  expect(await verifyPassword(hash, authEnv.ROOT_PASSWORD_TEST)).toBe(true);
  expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
  expect(matchesSecret('secret', secretDigest('secret'))).toBe(true);
  expect(matchesSecret('other', secretDigest('secret'))).toBe(false);
  expect(matchesSecret('secret', 'invalid')).toBe(false);
});

it('accepts only the signed session reference and privacy-separates throttle keys', async () => {
  const id = randomUUID();
  const secret = 'a'.repeat(64);
  const token = await signReference(id, secret, authEnv.SESSION_SECRET_TEST);
  expect(
    await readReference(
      sessionCookieName + '=' + token,
      authEnv.SESSION_SECRET_TEST
    )
  ).toEqual({ id, secret });
  expect(
    await readReference(sessionCookieName + '=' + token, 'different-key')
  ).toBeUndefined();
  expect(
    await readReference(undefined, authEnv.SESSION_SECRET_TEST)
  ).toBeUndefined();
  const keys = throttleKeys('same', 'same', authEnv.AUTH_THROTTLE_SECRET_TEST);
  expect(keys[0]).not.toBe(keys[1]);
  expect(keys.every(key => /^[a-f0-9]{64}$/.test(key))).toBe(true);
});

it('selects production authentication and bootstrap inputs without development fallback', () => {
  const env = {
    ...authEnv,
    NODE_ENV: 'production',
    SESSION_SECRET_PROD: 'c'.repeat(64),
    AUTH_THROTTLE_SECRET_PROD: 'd'.repeat(64),
    COOKIE_SECURE_PROD: 'true',
    COOKIE_SAMESITE_PROD: 'strict',
    ROOT_TENANT_CODE_PROD: 'NAP',
    ROOT_COMPANY_PROD: 'Production',
    ROOT_EMAIL_PROD: 'root@production.test',
    ROOT_PASSWORD_PROD: 'production-only-password',
  };
  const config = authConfiguration(env);
  expect(config.sessionSecret).toBe(env.SESSION_SECRET_PROD);
  expect(config.throttleSecret).toBe(env.AUTH_THROTTLE_SECRET_PROD);
  expect(config.secure).toBe(true);
  expect(config.sameSite).toBe('strict');
  const bootstrap = bootstrapConfiguration(env, []);
  expect(bootstrap.email).toBe(env.ROOT_EMAIL_PROD);
  expect(bootstrap.password).toBe(env.ROOT_PASSWORD_PROD);
  expect(() =>
    authConfiguration({ ...env, SESSION_SECRET_PROD: undefined })
  ).toThrow();
  expect(() =>
    bootstrapConfiguration(
      { ...env, ROOT_PASSWORD_PROD: '<production-root-password>' },
      []
    )
  ).toThrow();
});
