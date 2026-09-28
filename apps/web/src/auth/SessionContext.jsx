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
import { visibleTenantManagementChildren } from '../shell/tenantManagementNav.js';

/**
 * The access context and the resolved capabilities (I0005-R011), loaded
 * together at shell entry.
 * @returns {Promise<[object, object]>}
 */
function loadContext() {
  return Promise.all([api.getAccessContext(), api.getSessionCapabilities()]);
}

const EMPTY = {
  status: 'loading',
  session: null,
  user: null,
  selectedTenant: null,
  operator: null,
  entryPoints: null,
  capabilities: null,
  notice: null,
  error: null,
};

const SessionContext = createContext(null);

/**
 * The application's one piece of authenticated state, loaded from
 * `GET /access/context` and `GET /session/capabilities` and kept in sync with every mutation the PRD's
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

  const applyContext = ([context, capabilities]) =>
    setState({
      status: 'ready',
      session: context.session,
      user: context.user,
      selectedTenant: context.selectedTenant,
      operator: context.operator,
      entryPoints: context.entryPoints,
      capabilities,
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
    () => loadContext().then(applyContext, applyContextFailure),
    []
  );

  const refresh = useCallback(async () => {
    setState(prev => ({ ...prev, status: 'loading' }));
    await load();
  }, [load]);

  /**
   * Enter the application after login or a required password change
   * (I0001-R003): load the access context and, when no tenant is selected
   * and exactly one is eligible, select it. Selection goes through the
   * normal server contract, so an unavailable cell simply leaves the user
   * unselected, and they can pick a tenant from the tenant control.
   */
  const enter = useCallback(async () => {
    setState(prev => ({ ...prev, status: 'loading' }));
    let context;
    let capabilities;
    try {
      [context, capabilities] = await loadContext();
    } catch (error) {
      applyContextFailure(error);
      return;
    }
    if (!context.selectedTenant && context.entryPoints?.tenant) {
      try {
        const tenants = await api.listTenants();
        if (tenants.length === 1) {
          const session = await api.selectTenant(tenants[0].id);
          context = { ...context, session, selectedTenant: tenants[0] };
          capabilities = await api.getSessionCapabilities();
        }
      } catch {
        // Stay unselected; tenant selection remains available.
      }
    }
    applyContext([context, capabilities]);
  }, []);

  useEffect(() => {
    // Initial state is already `loading` — the mount-time read needs no
    // synchronous reset. The `.then(...)` callbacks below are the one
    // effect in this file that genuinely synchronizes with an external
    // system (the server), so their state updates run in a callback, never
    // synchronously in the effect body itself.
    loadContext().then(applyContext, applyContextFailure);
  }, []);

  /** Mid-use expiry: clear state, remember where we were, and bounce to `/login`. */
  const expire = useCallback(() => {
    storeReturnPath(locationRef.current.pathname);
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
      await enter();
    },
    [enter]
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
      await enter();
    },
    [enter, expire]
  );

  const selectTenant = useCallback(
    async (tenantId, tenantSummary) => {
      try {
        const session = await api.selectTenant(tenantId);
        // I0005 §8: a new target tenant means new capabilities.
        const capabilities = await api.getSessionCapabilities();
        setState(prev => ({
          ...prev,
          status: 'ready',
          session,
          selectedTenant: tenantSummary,
          capabilities,
        }));
      } catch (error) {
        if (error instanceof ApiError && error.code === 'UNAUTHENTICATED')
          return expire();
        throw error;
      }
    },
    [expire]
  );

  /**
   * Reload the resolved capabilities, after the server denies an action the
   * web app offered (I0005-R011).
   */
  const refreshCapabilities = useCallback(async () => {
    try {
      const capabilities = await api.getSessionCapabilities();
      setState(prev => ({ ...prev, capabilities }));
    } catch {
      // Keep the current set; the server still decides every request.
    }
  }, []);

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

  const value = useMemo(() => {
    // Whether any Tenant Management destination is open to this session.
    const management =
      visibleTenantManagementChildren(state.capabilities).length > 0;
    return {
      ...state,
      management,
      destination: deriveDestination({ ...state, management }),
      refresh,
      refreshCapabilities,
      login,
      changePassword,
      selectTenant,
      logout,
    };
  }, [
    state,
    refresh,
    refreshCapabilities,
    login,
    changePassword,
    selectTenant,
    logout,
  ]);

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
