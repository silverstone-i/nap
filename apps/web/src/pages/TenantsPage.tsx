/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useEffect, useState } from 'react';
import { Navigate, Link, useNavigate } from 'react-router';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { getMemberships, selectMembership } from '../api/control.js';
import { useSession } from '../auth/session.js';
import { AuthFrame } from '../auth/AuthFrame.js';
import { SessionStatus } from '../auth/SessionStatus.js';

/** Does: Lists and selects eligible memberships without cell details. Called by: the tenant route. */
export function TenantsPage() {
  const { state, reload } = useSession();
  const navigate = useNavigate();
  const eligible =
    state.status === 'ready' &&
    !!state.session &&
    state.session.state !== 'password-change-required' &&
    !state.session.controlledAccess;
  const [rows, setRows] = useState<
    { id: string; tenantCode: string; company: string }[]
  >([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    if (!eligible) return;
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
  }, [eligible]);
  /** Does: Switches this session and clears old tenant state. Called by: a tenant button. */
  async function select(id: string) {
    setBusy(true);
    const result = await selectMembership(id);
    if (result.ok) {
      reload();
      await navigate('/account', { replace: true });
    } else {
      setMessage(result.error.message);
      setBusy(false);
    }
  }
  if (state.status !== 'ready') return <SessionStatus />;
  if (!state.session) return <Navigate to="/login?next=%2Ftenants" replace />;
  if (state.session.state === 'password-change-required')
    return <Navigate to="/account" replace />;
  return (
    <AuthFrame title="Choose tenant">
      <Stack spacing={2}>
        {message && <Alert severity="error">{message}</Alert>}
        {busy && <Typography>Loading…</Typography>}
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
      </Stack>
    </AuthFrame>
  );
}
