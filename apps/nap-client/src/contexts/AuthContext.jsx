/**
 * @file Auth context — user session, login/logout, tenant resolution
 * @module nap-client/contexts/AuthContext
 *
 * Provides { user, loading, login, logout, tenant } to the component tree.
 * On mount, hydrates the session from the httpOnly cookie via getMe().
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import authApi from '../services/authApi.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Hydrate session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authApi.getMe();
        if (!cancelled) setUser(data.user ?? null);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    await authApi.login(email, password);
    const data = await authApi.getMe();
    setUser(data.user ?? null);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // best-effort
    }
    setUser(null);
  }, []);

  const tenant = useMemo(
    () =>
      user
        ? { tenant_code: user.tenant_code, schema_name: user.schema_name }
        : null,
    [user],
  );

  const value = useMemo(
    () => ({ user, loading, login, logout, tenant }),
    [user, loading, login, logout, tenant],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export default AuthContext;
