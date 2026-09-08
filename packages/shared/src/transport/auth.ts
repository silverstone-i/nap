/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import { successResponseSchema } from './envelopes.js';

/**
 * Does: Describes the email and password accepted by login.
 * Used by: both API validation and web login.
 */
export const loginBodySchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(128)),
  password: z.string().min(1).max(128),
});

/**
 * Does: Describes the current password and replacement password accepted by account settings.
 * Used by: API and web password forms.
 */
export const passwordBodySchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(12).max(128),
});

/**
 * Does: Describes the public identity, tenant, and effective session deadline.
 * Used by: API replies and web auth state.
 */
export const sessionViewSchema = z.strictObject({
  actorId: z.uuid(),
  email: z.email(),
  tenantId: z.uuid(),
  tenantCode: z.string().min(1).max(16),
  expiresAt: z.iso.datetime(),
});

/**
 * Does: Describes a successful login or session lookup envelope.
 * Used by: auth API and web requests.
 */
export const sessionResponseSchema = successResponseSchema(sessionViewSchema);

/**
 * Does: Describes a successful logout or password-change envelope.
 * Used by: auth API and web requests.
 */
export const authSuccessSchema = successResponseSchema(z.null());

/**
 * Does: Represents the validated public session view.
 * Used by: web session state and API session middleware.
 */
export type SessionView = z.infer<typeof sessionViewSchema>;
