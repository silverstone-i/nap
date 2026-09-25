/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Navigate } from 'react-router';
import { useSession } from './SessionContext.jsx';
import { FullPageError, FullPageLoader } from './StatusScreens.jsx';

/**
 * Loading and error states shared by every guard below — a protected
 * route's content never renders until its session requirement is resolved
 * (I0001-R004), and a failed resolution shows an explicit, retryable error
 * rather than a silent fallback (R021).
 * @param {ReturnType<typeof useSession>} session
 * @returns {JSX.Element|null}
 */
function commonGate(session) {
  if (session.status === 'loading') return <FullPageLoader />;
  if (session.status === 'error')
    return <FullPageError onRetry={session.refresh} />;
  return null;
}

/** Guards `/password` — reachable while restricted (forced) or ready (voluntary). */
export function RequirePasswordAccess({ children }) {
  const session = useSession();
  const gate = commonGate(session);
  if (gate) return gate;
  if (session.status === 'anonymous') return <Navigate to="/login" replace />;
  return children;
}

/** Guards `/tenants`. */
export function RequireTenantSelectionAccess({ children }) {
  const session = useSession();
  const gate = commonGate(session);
  if (gate) return gate;
  if (session.status === 'anonymous') return <Navigate to="/login" replace />;
  if (session.status === 'restricted')
    return <Navigate to="/password" replace />;
  // Reachable with a tenant already selected: this is how the tenant
  // control switches tenants.
  if (!session.entryPoints?.tenant)
    return <Navigate to={session.destination ?? '/login'} replace />;
  return children;
}

/** Guards `/home`: open to a selected tenant or management access. */
export function RequireHomeAccess({ children }) {
  const session = useSession();
  const gate = commonGate(session);
  if (gate) return gate;
  if (session.status === 'anonymous') return <Navigate to="/login" replace />;
  if (session.status === 'restricted')
    return <Navigate to="/password" replace />;
  if (!session.selectedTenant && !session.entryPoints?.platform)
    return <Navigate to={session.destination ?? '/login'} replace />;
  return children;
}

/** Guards `/management/*`. */
export function RequireManagementAccess({ children }) {
  const session = useSession();
  const gate = commonGate(session);
  if (gate) return gate;
  if (session.status === 'anonymous') return <Navigate to="/login" replace />;
  if (session.status === 'restricted')
    return <Navigate to="/password" replace />;
  if (!session.entryPoints?.platform)
    return <Navigate to={session.destination ?? '/login'} replace />;
  return children;
}
