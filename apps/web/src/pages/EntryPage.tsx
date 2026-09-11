/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { Navigate } from 'react-router';
import { useSession, sessionDestination } from '../auth/session.js';
import { SessionStatus } from '../auth/SessionStatus.js';
/**
 * Does: Opens the correct login, selection, central or tenant destination.
 * Called by: the root product entry route.
 */
export function EntryPage() {
  const { state } = useSession();
  if (state.status !== 'ready') return <SessionStatus />;
  return (
    <Navigate
      replace
      to={state.session ? sessionDestination(state.session) : '/login'}
    />
  );
}
