/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { listTenants } from '../api/endpoints.js';
import { useSession } from '../auth/SessionContext.jsx';
import { Wordmark } from '../shell/Wordmark.jsx';

/**
 * `/tenants` — lists the caller's eligible tenants (F0001-R007) and applies
 * the caller's selection. `entryPoints.tenant` only signals "at least one
 * exists"; the actual list always comes from `GET /access/tenants`.
 */
export function TenantsPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'loading', tenants: [] });
  const [selectingId, setSelectingId] = useState(null);
  const [selectError, setSelectError] = useState(null);
  const [retryTick, setRetryTick] = useState(0);

  // Reset to a loading state whenever a (re)load is requested. Adjusted
  // during render (see StandardDataGrid for the same pattern) rather than
  // in an effect, since the reset itself is derived UI state; the effect
  // below only performs the actual fetch.
  const [committedTick, setCommittedTick] = useState(null);
  if (committedTick !== retryTick) {
    setCommittedTick(retryTick);
    setState({ status: 'loading', tenants: [] });
  }

  useEffect(() => {
    let cancelled = false;
    listTenants().then(
      tenants => {
        if (!cancelled) setState({ status: 'ready', tenants });
      },
      () => {
        if (!cancelled) setState({ status: 'error', tenants: [] });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [retryTick]);

  const load = () => setRetryTick(tick => tick + 1);

  async function handleSelect(tenant) {
    setSelectError(null);
    setSelectingId(tenant.id);
    try {
      await session.selectTenant(tenant.id, tenant);
      navigate(`/app/${tenant.id}`, { replace: true });
    } catch {
      setSelectError(
        'This tenant is no longer available. Choose another tenant.'
      );
      load();
    } finally {
      setSelectingId(null);
    }
  }

  return (
    <Box
      component="main"
      sx={{ minHeight: '100vh', p: 3, maxWidth: 640, mx: 'auto' }}
    >
      <Box sx={{ mb: 3 }}>
        <Wordmark fontSize="24px" />
      </Box>
      <Typography component="h1" variant="h6" sx={{ mb: 2 }} tabIndex={-1}>
        Choose a tenant
      </Typography>

      {selectError ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {selectError}
        </Alert>
      ) : null}

      {state.status === 'loading' ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress aria-label="Loading tenants" />
        </Box>
      ) : state.status === 'error' ? (
        <Stack spacing={2} alignItems="flex-start">
          <Alert severity="error">Could not load your tenants.</Alert>
          <Button variant="outlined" onClick={load}>
            Retry
          </Button>
        </Stack>
      ) : state.tenants.length === 0 ? (
        <Alert severity="info">You do not have access to any tenant yet.</Alert>
      ) : (
        <Stack spacing={1.5}>
          {state.tenants.map(tenant => (
            <Card key={tenant.id} variant="outlined">
              <CardActionArea
                onClick={() => handleSelect(tenant)}
                disabled={selectingId !== null}
                sx={{ p: 2, display: 'flex', justifyContent: 'space-between' }}
              >
                <Box>
                  <Typography variant="body1">{tenant.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {tenant.code} · {tenant.tier}
                  </Typography>
                </Box>
                {selectingId === tenant.id ? (
                  <CircularProgress size={20} />
                ) : null}
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      )}
    </Box>
  );
}
