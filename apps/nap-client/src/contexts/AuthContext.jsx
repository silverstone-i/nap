/**
 * @file Auth context — user session, login/logout, tenant resolution
 * @module nap-client/contexts/AuthContext
 *
 * Provides { user, loading, login, logout, refreshUser, tenant, isNapSoftUser }
 * to the component tree. On mount, hydrates the session from the httpOnly
 * cookie via getMe().
 *
 * Phase 2: Basic auth. Phase 3+ adds impersonation and cross-tenant assumption.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import authApi from '../services/authApi.js';
import { setAssumedTenant } from '../services/client.js';

const NAPSOFT_TENANT = (import.meta.env.VITE_NAPSOFT_TENANT || 'nap').toLowerCase();

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  // Hydrate session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authApi.getMe();
        if (!cancelled) {
          setUser(data.user ?? null);
          setTenant(data.tenant ?? null);
          if (data.tenant?.tenant_code) {
            setAssumedTenant(data.tenant.tenant_code);
          }
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setTenant(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const loginRes = await authApi.login(email, password);
    if (!loginRes?.forcePasswordChange) {
      const data = await authApi.getMe();
      setUser(data.user ?? null);
      setTenant(data.tenant ?? null);
      if (data.tenant?.tenant_code) {
        setAssumedTenant(data.tenant.tenant_code);
      }
    }
    return loginRes;
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await authApi.getMe();
    setUser(data.user ?? null);
    setTenant(data.tenant ?? null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // best-effort
    }
    setAssumedTenant(null);
    setTenant(null);
    setUser(null);
  }, []);

  const isNapSoftUser = useMemo(
    () => tenant?.tenant_code?.toLowerCase() === NAPSOFT_TENANT,
    [tenant],
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      refreshUser,
      tenant,
      isNapSoftUser,
      // Phase 3+ will add: assumedTenant, assumeTenant, exitAssumption,
      // impersonation, startImpersonation, endImpersonation
    }),
    [user, loading, login, logout, refreshUser, tenant, isNapSoftUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export default AuthContext;
