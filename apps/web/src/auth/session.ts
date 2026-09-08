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
 * Does: Returns a local navigation path or the account fallback for unsafe destinations.
 * Called by: the login page after sign-in.
 */
export function safeNext(value: string | null) {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\u0000- ]/.test(value)
  )
    return '/account';
  const parsed = new URL(value, 'https://nap.invalid');
  if (parsed.origin !== 'https://nap.invalid' || parsed.pathname === '/login')
    return '/account';
  return parsed.pathname + parsed.search + parsed.hash;
}
