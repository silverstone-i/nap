/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { Navigate } from 'react-router';
import Alert from '@mui/material/Alert';
import { useSession } from '../auth/session.js';
import { SessionStatus } from '../auth/SessionStatus.js';
import { managementDestinations } from '../shell/managementNavigation.js';
/** Does: Opens the first permitted administration destination. Called by: management landing and legacy control URLs. */
export function ManagementLandingPage() {
  const { state } = useSession();
  if (state.status !== 'ready') return <SessionStatus />;
  if (!state.session)
    return <Navigate replace to="/login?next=%2Fmanagement" />;
  if (state.session.state === 'password-change-required')
    return <Navigate replace to="/account/password?next=%2Fmanagement" />;
  if (state.session.controlledAccess)
    return (
      <Alert severity="warning">
        Exit controlled access before administering the platform.
      </Alert>
    );
  const first = managementDestinations(state.session.platformPermissions)[0];
  return first ? (
    <Navigate replace to={first.path} />
  ) : (
    <Alert severity="warning">Tenant Management is unavailable.</Alert>
  );
}
