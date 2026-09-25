/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Navigate, useNavigate, useParams } from 'react-router';
import { useSession } from './SessionContext.jsx';
import {
  FullPageError,
  FullPageLoader,
  TenantUnavailableScreen,
} from './StatusScreens.jsx';

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
  if (session.selectedTenant)
    return <Navigate to={`/app/${session.selectedTenant.id}`} replace />;
  if (!session.entryPoints?.tenant)
    return <Navigate to={session.destination ?? '/login'} replace />;
  return children;
}

/** Guards `/management`. */
export function RequirePlatformAccess({ children }) {
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

/**
 * Guards `/app/:tenantId`. A mismatch (stale link, a tenant that just
 * became ineligible) renders an inline error instead of redirecting or
 * mutating session state — I0001-R008/AC04.
 */
export function RequireTenantShellAccess({ children }) {
  const session = useSession();
  const { tenantId } = useParams();
  const navigate = useNavigate();
  const gate = commonGate(session);
  if (gate) return gate;
  if (session.status === 'anonymous') return <Navigate to="/login" replace />;
  if (session.status === 'restricted')
    return <Navigate to="/password" replace />;
  if (!session.selectedTenant || session.selectedTenant.id !== tenantId)
    return (
      <TenantUnavailableScreen onChooseTenant={() => navigate('/tenants')} />
    );
  return children;
}
