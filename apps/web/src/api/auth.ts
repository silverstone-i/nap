/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { authSuccessSchema, sessionResponseSchema } from '@nap/shared';
import { requestContract } from './request.js';

const base = '/api/admin-tenancy/v1/auth';

/**
 * Does: Loads the session currently represented by the browser cookie.
 * Called by: web auth state at route entry.
 */
export function getSession() {
  return requestContract(base + '/session', sessionResponseSchema);
}

/**
 * Does: Submits credentials and returns the checked session reply.
 * Called by: the login form.
 */
export function login(email: string, password: string) {
  return requestContract(base + '/login', sessionResponseSchema, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

/**
 * Does: Revokes the browser session and clears its cookie.
 * Called by: the account logout action.
 */
export function logout() {
  return requestContract(base + '/logout', authSuccessSchema, {
    method: 'POST',
  });
}

/**
 * Does: Submits a current password and its replacement.
 * Called by: the account password form.
 */
export function changePassword(currentPassword: string, newPassword: string) {
  return requestContract(base + '/password', authSuccessSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
