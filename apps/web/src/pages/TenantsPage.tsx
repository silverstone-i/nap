/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useEffect, useState, useRef } from 'react';
import { Navigate, Link, useNavigate, useSearchParams } from 'react-router';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { z } from 'zod';
import type { membershipsResponseSchema } from '@nap/shared';
import { getMemberships, selectMembership } from '../api/control.js';
import { getSession } from '../api/auth.js';
import { invalidateRequests, requestGeneration } from '../api/lifecycle.js';
import { useSession, safeNext, sessionDestination } from '../auth/session.js';
import { AuthFrame } from '../auth/AuthFrame.js';
import { SessionStatus } from '../auth/SessionStatus.js';

/** Does: Lists eligible tenants and confirms selection before restoring a destination. Called by: login and Change tenant. */
export function TenantsPage() {
  const { state, setSession } = useSession();
  const navigate = useNavigate();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [search] = useSearchParams();
  const next = safeNext(search.get('next'));
  const targetTenant = /^\/app\/([^/]+)\//.exec(next)?.[1];
  const eligible =
    state.status === 'ready' &&
    !!state.session &&
    state.session.state !== 'password-change-required' &&
    !state.session.controlledAccess;
  const [rows, setRows] = useState<
    z.infer<typeof membershipsResponseSchema>['data']
  >([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!eligible) return;
    invalidateRequests();
    let active = true;
    void getMemberships().then(result => {
      if (!active) return;
      setBusy(false);
      if (result.ok) setRows(result.body.data);
      else setMessage(result.error.message);
    });
    return () => {
      active = false;
    };
  }, [eligible, revision]);
  /** Does: Rotates the selected session and uses its verified tenant for navigation. Called by: a tenant choice. */
  async function select(id: string) {
    setBusy(true);
    setMessage('');
    invalidateRequests();
    const generation = requestGeneration();
    const result = await selectMembership(id);
    if (!mounted.current || generation !== requestGeneration()) return;
    if (result.ok) {
      const checked = await getSession();
      if (!mounted.current || generation !== requestGeneration()) return;
      if (checked.ok) {
        setSession(checked.body.data);
        const destination =
          !targetTenant || targetTenant === checked.body.data.tenantId
            ? next
            : null;
        await navigate(sessionDestination(checked.body.data, destination), {
          replace: true,
        });
        return;
      }
      setMessage(checked.error.message);
    } else setMessage(result.error.message);
    setBusy(false);
  }
  if (state.status !== 'ready') return <SessionStatus />;
  if (!state.session)
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  if (state.session.state === 'password-change-required')
    return <Navigate to={sessionDestination(state.session, next)} replace />;
  if (state.session.controlledAccess) return <Navigate to="/" replace />;
  const unavailable =
    !busy && !!targetTenant && !rows.some(row => row.tenantId === targetTenant);
  return (
    <AuthFrame title="Choose tenant">
      <Stack spacing={2}>
        {message && (
          <Alert severity="error">
            {message}
            <Button
              onClick={() => {
                setMessage('');
                setBusy(true);
                setRevision(v => v + 1);
              }}
            >
              Retry
            </Button>
          </Alert>
        )}
        {unavailable && (
          <Alert severity="warning">
            The requested destination is unavailable. Choose an available tenant
            to open its Dashboard.
          </Alert>
        )}
        {busy && <Typography role="status">Loading…</Typography>}
        {!busy && !rows.length && (
          <Typography>No available memberships.</Typography>
        )}
        {rows.map(row => (
          <Button
            key={row.id}
            disabled={busy}
            onClick={() => void select(row.id)}
          >
            {row.company} ({row.tenantCode})
          </Button>
        ))}
        <Button component={Link} to="/account">
          Account
        </Button>
        {!!state.session.platformPermissions.length && (
          <Button component={Link} to="/control">
            Administration
          </Button>
        )}
      </Stack>
    </AuthFrame>
  );
}
