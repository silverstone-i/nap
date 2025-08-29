import { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client.js';

// Create a context to hold authentication state and actions.  This
// wrapper centralises login/logout logic and allows the rest of the
// application to query whether a user is authenticated and what
// permissions they have.  In a real application you would integrate
// with your backend's auth endpoints.
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load current session on mount via /api/v1/auth/me. Cookies are httpOnly
  // so the server controls session; we just derive a user object for UI.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me();
        if (!cancelled) {
          const u = me?.user || null;
          const tenantName = me?.tenant?.name || me?.tenant?.tenant_code || null;
          setUser(u ? { ...u, tenant: tenantName } : null);
        }
      } catch (_err) {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Login: POST credentials, then fetch /me to populate user.
  const login = async ({ email, password }) => {
    await api.login(email, password);
    const me = await api.me();
    const u = me?.user || null;
    const tenantName = me?.tenant?.name || me?.tenant?.tenant_code || null;
    setUser(u ? { ...u, tenant: tenantName } : null);
    return u;
  };

  // Logout: clear server cookies and local state
  const logout = async () => {
    try {
      await api.logout();
    } catch (_e) {
      /* ignore */
    }
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
};

// Custom hook to access the auth context.  Components can call
// useAuth() to determine whether a user is logged in and what their
// role is.
export const useAuth = () => {
  return useContext(AuthContext);
};
