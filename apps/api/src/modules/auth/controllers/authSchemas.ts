/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';

/** Field lengths mirror the column definitions (ADR-0004). */
export const loginSchema = z.object({
  email: z.string().email().max(128),
  password: z.string().min(1).max(512),
});

export const switchTenantSchema = z.object({
  tenant_code: z.string().min(1).max(6),
});

// PRD 0004 sets no complexity policy; the 8-character floor is this
// implementation's assumption, noted in the PR.
export const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(512),
  new_password: z.string().min(8).max(512),
});

/** The four idle-window choices (ADR-0014 decision 4). */
export const idleWindowSchema = z.object({
  idle_minutes: z.union([
    z.literal(30),
    z.literal(60),
    z.literal(90),
    z.literal(120),
  ]),
});
