/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';

/**
 * Does: Checks whether a configured secret is a sample value.
 * Called by: authentication configuration and bootstrap validation.
 */
export function placeholder(value: string) {
  return /change[ -]?me|replace[ -]?me|example|your[-_ ]|placeholder/i.test(
    value
  );
}

/**
 * Does: Reads bounded password-hashing parameters without reading session secrets.
 * Called by: bootstrap and authentication configuration.
 */
export function passwordOptions(env: NodeJS.ProcessEnv = process.env) {
  return z
    .object({
      memoryCost: z.coerce
        .number()
        .int()
        .min(19456)
        .max(1048576)
        .default(19456),
      timeCost: z.coerce.number().int().min(2).max(20).default(2),
      parallelism: z.coerce.number().int().min(1).max(16).default(1),
    })
    .parse({
      memoryCost: env.ARGON2_MEMORY_KIB,
      timeCost: env.ARGON2_TIME_COST,
      parallelism: env.ARGON2_PARALLELISM,
    });
}

/**
 * Does: Reads session, cookie, and throttle configuration and refuses unusable secrets.
 * Called by: server startup before opening its listener.
 */
export function authConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const secret = z
    .string()
    .min(32)
    .refine(value => !placeholder(value));
  const parsed = z
    .object({
      sessionSecret: secret,
      throttleSecret: secret,
      idleMinutes: z.coerce.number().int().min(1).max(1440).default(30),
      absoluteHours: z.coerce.number().int().min(1).max(8760).default(12),
      secure: z
        .enum(['true', 'false'])
        .default('true')
        .transform(value => value === 'true'),
      sameSite: z.enum(['lax', 'strict', 'none']).default('lax'),
    })
    .parse({
      sessionSecret: env.SESSION_SECRET,
      throttleSecret: env.AUTH_THROTTLE_SECRET,
      idleMinutes: env.SESSION_IDLE_MINUTES,
      absoluteHours: env.SESSION_ABSOLUTE_HOURS,
      secure: env.COOKIE_SECURE,
      sameSite: env.COOKIE_SAMESITE,
    });
  if (parsed.sameSite === 'none' && !parsed.secure)
    throw new Error('SameSite none requires secure cookies');
  return { ...parsed, password: passwordOptions(env) };
}

/**
 * Does: Represents checked authentication configuration.
 * Used by: the runtime, authentication services, and route factory.
 */
export type AuthConfiguration = ReturnType<typeof authConfiguration>;
