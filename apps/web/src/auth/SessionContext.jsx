/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/* eslint-disable react-refresh/only-export-components --
 * The provider and its `useSession` accessor are one unit; splitting them
 * into separate files would only make the pairing harder to find. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ApiError } from '../api/client.js';
import * as api from '../api/endpoints.js';
import { clearReturnPath, storeReturnPath } from './returnPath.js';
import { deriveDestination } from './deriveDestination.js';

const EMPTY = {
  status: 'loading',
  session: null,
  user: null,
  selectedTenant: null,
  operator: null,
  entryPoints: null,
  notice: null,
  error: null,
};

const SessionContext = createContext(null);

/**
 * The application's one piece of authenticated state, loaded from
 * `GET /access/context` and kept in sync with every mutation the PRD's
 * lifecycle table describes. Server session resolution remains the source
 * of truth (§7); this context only mirrors it for routing and display —
 * every actual data request is still authorized by the server itself.
 * @param {{children: import('react').ReactNode}} props
 * @returns {JSX.Element}
 */
export function SessionProvider({ children }) {
  const [state, setState] = useState(EMPTY);
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  const applyContext = context =>
    setState({
      status: 'ready',
      session: context.session,
      user: context.user,
      selectedTenant: context.selectedTenant,
      operator: context.operator,
      entryPoints: context.entryPoints,
      notice: null,
      error: null,
    });

  const applyContextFailure = error => {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
      setState({ ...EMPTY, status: 'anonymous' });
    } else if (
      error instanceof ApiError &&
      error.code === 'PASSWORD_CHANGE_REQUIRED'
    ) {
      setState({ ...EMPTY, status: 'restricted' });
    } else {
      setState({ ...EMPTY, status: 'error', error });
    }
  };

  /** Load the access context, for an explicit retry or after a mutation the lifecycle table says should reload context. */
  const load = useCallback(
    () => api.getAccessContext().then(applyContext, applyContextFailure),
    []
  );

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, status: 'loading' }));
    await load();
  }, [load]);

  useEffect(() => {
    // Initial state is already `loading` — the mount-time read needs no
    // synchronous reset. The `.then(...)` callbacks below are the one
    // effect in this file that genuinely synchronizes with an external
    // system (the server), so their state updates run in a callback, never
    // synchronously in the effect body itself.
    api.getAccessContext().then(applyContext, applyContextFailure);
  }, []);

  /** Mid-use expiry: clear state, remember where we were, and bounce to `/login`. */
  const expire = useCallback(() => {
    const path = locationRef.current.pathname + locationRef.current.search;
    storeReturnPath(path);
    setState({ ...EMPTY, status: 'anonymous', notice: 'sessionExpired' });
    navigate('/login', { replace: true });
  }, [navigate]);

  const login = useCallback(
    async (email, password) => {
      const session = await api.login(email, password);
      if (session.restricted) {
        setState({ ...EMPTY, status: 'restricted', session });
        return;
      }
      await refresh();
    },
    [refresh]
  );

  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      try {
        await api.changePassword(currentPassword, newPassword);
      } catch (error) {
        if (error instanceof ApiError && error.code === 'UNAUTHENTICATED')
          return expire();
        throw error;
      }
      await refresh();
    },
    [refresh, expire]
  );

  const selectTenant = useCallback(
    async (tenantId, tenantSummary) => {
      try {
        const session = await api.selectTenant(tenantId);
        setState(prev => ({
          ...prev,
          status: 'ready',
          session,
          selectedTenant: tenantSummary,
        }));
      } catch (error) {
        if (error instanceof ApiError && error.code === 'UNAUTHENTICATED')
          return expire();
        throw error;
      }
    },
    [expire]
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // R006: clear client-held state regardless of the outcome — the
      // browser must be able to drop a cookie it can no longer use.
    }
    clearReturnPath();
    setState({ ...EMPTY, status: 'anonymous' });
    navigate('/login', { replace: true });
  }, [navigate]);

  const value = useMemo(
    () => ({
      ...state,
      destination: deriveDestination(state),
      refresh,
      login,
      changePassword,
      selectTenant,
      logout,
    }),
    [state, refresh, login, changePassword, selectTenant, logout]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

/** @returns {ReturnType<typeof useMemo>} The session context value. */
export function useSession() {
  const context = useContext(SessionContext);
  if (!context)
    throw new Error('useSession must be used within SessionProvider');
  return context;
}
