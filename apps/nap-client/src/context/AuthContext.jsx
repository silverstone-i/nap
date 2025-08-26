import React, { createContext, useContext, useState, useEffect } from 'react';

// Create a context to hold authentication state and actions.  This
// wrapper centralises login/logout logic and allows the rest of the
// application to query whether a user is authenticated and what
// permissions they have.  In a real application you would integrate
// with your backend's auth endpoints.
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, check local storage for a saved session.  This
  // simplistic approach illustrates how you might persist
  // authentication across page reloads.  Replace with secure
  // storage/token management as needed.
  useEffect(() => {
    const storedUser = localStorage.getItem('nap-user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  // Perform a login by sending credentials to the server.  For the
  // skeleton we simply accept any credentials and set a dummy
  // user.  Replace this logic with a call to your /auth/login
  // endpoint.  The returned user object should include at least the
  // user's role and tenant information.
  const login = async (credentials) => {
    // TODO: call real API
    const fakeUser = { email: credentials.email, role: 'admin', tenant: 'Demo Co' };
    setUser(fakeUser);
    localStorage.setItem('nap-user', JSON.stringify(fakeUser));
    return fakeUser;
  };

  // Remove user and session information.  Implement a call to
  // /auth/logout if your backend provides one.  Always clear any
  // tokens or sensitive information from storage on logout.
  const logout = () => {
    setUser(null);
    localStorage.removeItem('nap-user');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to access the auth context.  Components can call
// useAuth() to determine whether a user is logged in and what their
// role is.
export const useAuth = () => {
  return useContext(AuthContext);
};