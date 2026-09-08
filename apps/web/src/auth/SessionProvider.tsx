/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useCallback, useEffect, useState } from 'react';
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
  return (
    <SessionContext value={{ state, setSession, reload }}>
      <Outlet />
    </SessionContext>
  );
}
