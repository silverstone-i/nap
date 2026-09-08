/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { exitAccess } from '../api/control.js';
import { Outlet } from 'react-router';
import { getSession } from '../api/auth.js';
import { SessionContext } from './session.js';
import type { SessionState } from './session.js';
import type { SessionView } from '@nap/shared';

/**
 * Does: Loads and shares the checked session across login and account routes.
 * Called by: the auth parent route.
 */
export function SessionProvider() {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const setSession = useCallback((session: SessionView | null) => {
    setState({ status: 'ready', session });
  }, []);
  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setRevision(value => value + 1);
  }, []);
  useEffect(() => {
    let active = true;
    void getSession().then(result => {
      if (!active) return;
      if (result.ok) setState({ status: 'ready', session: result.body.data });
      else if (result.error.code === 'UNAUTHENTICATED')
        setState({ status: 'ready', session: null });
      else setState({ status: 'error', message: result.error.message });
    });
    return () => {
      active = false;
    };
  }, [revision]);
  /** Does: Ends controlled access and reloads authoritative session state. Called by: the persistent banner. */
  async function leave() {
    const result = await exitAccess();
    if (result.ok) reload();
    else setState({ status: 'error', message: result.error.message });
  }
  return (
    <SessionContext value={{ state, setSession, reload }}>
      {state.status === 'ready' && state.session?.controlledAccess && (
        <Alert
          severity="warning"
          action={<Button onClick={() => void leave()}>Exit access</Button>}
        >
          Controlled {state.session.controlledAccess.mode}:{' '}
          {state.session.tenantCode} — {state.session.controlledAccess.reason}
        </Alert>
      )}
      <Outlet
        key={
          state.status === 'ready'
            ? `${state.session?.actorId}:${state.session?.tenantId}:${state.session?.controlledAccess?.mode}`
            : state.status
        }
      />
    </SessionContext>
  );
}
