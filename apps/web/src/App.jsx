/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Navigate, Route, Routes } from 'react-router';
import { SessionProvider, useSession } from './auth/SessionContext.jsx';
import {
  RequireHomeAccess,
  RequireManagementAccess,
  RequirePasswordAccess,
  RequireTenantSelectionAccess,
} from './auth/guards.jsx';
import {
  FullPageError,
  FullPageLoader,
  NoAccessScreen,
} from './auth/StatusScreens.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { CellsPage } from './pages/management/CellsPage.jsx';
import { PortalUsersPage } from './pages/management/PortalUsersPage.jsx';
import { TenantsPage as ManagementTenantsPage } from './pages/management/TenantsPage.jsx';
import { PasswordPage } from './pages/PasswordPage.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { TenantsPage } from './pages/TenantsPage.jsx';
import { AppShell } from './shell/AppShell.jsx';

/** `/` and any unknown path: send the caller to their resolved destination. */
function RootRedirect() {
  const session = useSession();
  if (session.status === 'loading') return <FullPageLoader />;
  if (session.status === 'error')
    return <FullPageError onRetry={session.refresh} />;
  if (session.status === 'anonymous' || session.status === 'restricted')
    return (
      <Navigate
        to={session.status === 'restricted' ? '/password' : '/login'}
        replace
      />
    );
  if (!session.destination) return <NoAccessScreen onLogout={session.logout} />;
  return <Navigate to={session.destination} replace />;
}

/**
 * Every signed-in page renders inside the one application shell (I0001-R009).
 * The shell is keyed by the selected tenant, so switching tenants remounts
 * it and clears tenant-specific UI state by construction (I0001-R007).
 * @param {{guard: import('react').ComponentType<{children: import('react').ReactNode}>, children: import('react').ReactNode}} props
 */
function ShellRoute({ guard: Guard, children }) {
  const session = useSession();
  return (
    <Guard>
      <AppShell key={session.selectedTenant?.id ?? 'none'}>{children}</AppShell>
    </Guard>
  );
}

export function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/password"
          element={
            <RequirePasswordAccess>
              <PasswordPage />
            </RequirePasswordAccess>
          }
        />
        <Route
          path="/tenants"
          element={
            <RequireTenantSelectionAccess>
              <TenantsPage />
            </RequireTenantSelectionAccess>
          }
        />
        <Route
          path="/home"
          element={
            <ShellRoute guard={RequireHomeAccess}>
              <HomePage />
            </ShellRoute>
          }
        />
        <Route
          path="/management/tenants"
          element={
            <ShellRoute guard={RequireManagementAccess}>
              <ManagementTenantsPage />
            </ShellRoute>
          }
        />
        <Route
          path="/management/cells"
          element={
            <ShellRoute guard={RequireManagementAccess}>
              <CellsPage />
            </ShellRoute>
          }
        />
        <Route
          path="/management/portal-users"
          element={
            <ShellRoute guard={RequireManagementAccess}>
              <PortalUsersPage />
            </ShellRoute>
          }
        />
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </SessionProvider>
  );
}
