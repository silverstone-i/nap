/**
 * @file Auth context — user session, login/logout, tenant resolution, impersonation
 * @module nap-client/contexts/AuthContext
 *
 * Provides { user, loading, login, logout, tenant, impersonation, ... } to the component tree.
 * On mount, hydrates the session from the httpOnly cookie via getMe().
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import authApi from '../services/authApi.js';
import client, { setAssumedTenant } from '../services/client.js';

const NAPSOFT_TENANT = (import.meta.env.VITE_NAPSOFT_TENANT || 'nap').toLowerCase();

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assumedTenant, setAssumedTenantState] = useState(null);
  const [impersonation, setImpersonation] = useState({ active: false });

  // Hydrate session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await authApi.getMe();
        if (!cancelled) {
          const u = data.user ?? null;
          if (u?.tenant_code) setAssumedTenant(u.tenant_code);
          setUser(u);
          setImpersonation(data.impersonation ?? { active: false });
        }
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
    const loginRes = await authApi.login(email, password);
    if (!loginRes?.forcePasswordChange) {
      const data = await authApi.getMe();
      const u = data.user ?? null;
      if (u?.tenant_code) setAssumedTenant(u.tenant_code);
      setUser(u);
      setImpersonation(data.impersonation ?? { active: false });
    }
    return loginRes;
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await authApi.getMe();
    setUser(data.user ?? null);
    setImpersonation(data.impersonation ?? { active: false });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // best-effort
    }
    setAssumedTenant(null);
    setAssumedTenantState(null);
    setImpersonation({ active: false });
    setUser(null);
  }, []);

  // ── Cross-tenant assumption (NapSoft users only) ─────────────────
  const assumeTenant = useCallback(async (tenantObj) => {
    setAssumedTenant(tenantObj.tenant_code);
    setAssumedTenantState(tenantObj);
    await refreshUser();
  }, [refreshUser]);

  const exitAssumption = useCallback(async () => {
    setAssumedTenant(null);
    setAssumedTenantState(null);
    await refreshUser();
  }, [refreshUser]);

  // ── Impersonation (NapSoft users only) ───────────────────────────
  const startImpersonation = useCallback(async (targetUserId, reason) => {
    const result = await client.post('/tenants/v1/admin/impersonate', {
      target_user_id: targetUserId,
      reason,
    });
    await refreshUser();
    return result;
  }, [refreshUser]);

  const endImpersonation = useCallback(async () => {
    await client.post('/tenants/v1/admin/exit-impersonation');
    await refreshUser();
  }, [refreshUser]);

  const isNapSoftUser = useMemo(
    () => user?.tenant_code?.toLowerCase() === NAPSOFT_TENANT || user?.home_tenant?.toLowerCase() === NAPSOFT_TENANT,
    [user],
  );

  const tenant = useMemo(
    () => {
      if (!user) return null;
      if (assumedTenant) {
        return {
          tenant_code: assumedTenant.tenant_code,
          schema_name: assumedTenant.schema_name || assumedTenant.tenant_code,
          company: assumedTenant.company,
          is_assumed: true,
        };
      }
      return { tenant_code: user.tenant_code, schema_name: user.schema_name };
    },
    [user, assumedTenant],
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
      assumedTenant,
      assumeTenant,
      exitAssumption,
      impersonation,
      startImpersonation,
      endImpersonation,
    }),
    [user, loading, login, logout, refreshUser, tenant, isNapSoftUser, assumedTenant, assumeTenant, exitAssumption, impersonation, startImpersonation, endImpersonation],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

export default AuthContext;
