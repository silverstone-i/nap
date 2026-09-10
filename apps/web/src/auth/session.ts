/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createContext, useContext } from 'react';
import type { SessionView } from '@nap/shared';

/**
 * Does: Represents session lookup, absence, and recoverable lookup errors.
 * Used by: the session provider and auth pages.
 */
export type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; session: SessionView | null }
  | { status: 'error'; message: string };

/**
 * Does: Carries the checked session and update actions for auth routes.
 * Used by: SessionProvider and useSession.
 */
export const SessionContext = createContext<{
  state: SessionState;
  setSession: (session: SessionView | null) => void;
  reload: () => void;
  refusal?: boolean;
} | null>(null);

/**
 * Does: Reads session state from the enclosing auth provider.
 * Called by: login and account pages during render.
 */
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('Auth page requires SessionProvider');
  return value;
}

/**
 * Does: Returns a local navigation path or the product-entry fallback for unsafe destinations.
 * Called by: the login page after sign-in.
 */
export function safeNext(value: string | null) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\u0000- ]/.test(value)
  )
    return '/';
  const parsed = new URL(value, 'https://nap.invalid');
  if (parsed.origin !== 'https://nap.invalid' || parsed.pathname === '/login')
    return '/';
  return parsed.pathname + parsed.search + parsed.hash;
}

/** Does: Chooses the next permitted session workflow while retaining a safe destination. Called by: login, password completion and product entry. */
export function sessionDestination(
  session: SessionView,
  next: string | null = null
): string {
  const target = safeNext(next);
  const suffix = target === '/' ? '' : `?next=${encodeURIComponent(target)}`;
  if (session.state === 'password-change-required') return '/account' + suffix;
  if (session.state === 'tenant-selection-required') {
    if (session.canChangeTenant || !session.platformPermissions.length)
      return '/tenants' + suffix;
    return session.platformPermissions.includes(
      'admin-tenancy::control::overview'
    )
      ? '/management/tenants'
      : '/control';
  }
  if (
    !session.userType &&
    !session.controlledAccess &&
    session.platformPermissions.includes('admin-tenancy::control::overview') &&
    target === '/'
  )
    return '/management/tenants';
  if (target !== '/' && target !== '/login' && target !== '/tenants')
    return target;
  return session.tenantId ? `/app/${session.tenantId}/dashboard` : '/tenants';
}
