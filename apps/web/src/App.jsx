/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Navigate, Route, Routes, useParams } from 'react-router';
import { SessionProvider, useSession } from './auth/SessionContext.jsx';
import {
  RequirePasswordAccess,
  RequirePlatformAccess,
  RequireTenantSelectionAccess,
  RequireTenantShellAccess,
} from './auth/guards.jsx';
import {
  FullPageError,
  FullPageLoader,
  NoAccessScreen,
} from './auth/StatusScreens.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { PasswordPage } from './pages/PasswordPage.jsx';
import { PlatformHome } from './pages/PlatformHome.jsx';
import { TenantHome } from './pages/TenantHome.jsx';
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
 * `/app/:tenantId` — keyed by `tenantId` so switching tenants remounts the
 * whole shell subtree, clearing tenant-specific UI state by construction
 * (F0001-R007).
 */
function TenantShellRoute() {
  const { tenantId } = useParams();
  return (
    <RequireTenantShellAccess>
      <AppShell key={tenantId} homePath={`/app/${tenantId}`} area="tenant">
        <TenantHome />
      </AppShell>
    </RequireTenantShellAccess>
  );
}

function PlatformShellRoute() {
  return (
    <RequirePlatformAccess>
      <AppShell homePath="/management" area="platform">
        <PlatformHome />
      </AppShell>
    </RequirePlatformAccess>
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
        <Route path="/management" element={<PlatformShellRoute />} />
        <Route path="/app/:tenantId" element={<TenantShellRoute />} />
        <Route path="/" element={<RootRedirect />} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </SessionProvider>
  );
}
