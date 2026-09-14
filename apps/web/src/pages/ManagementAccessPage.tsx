/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import {
  Alert,
  Box,
  Button,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { accessBodySchema } from '@nap/shared';
import { access } from '../api/control.js';
import { useSession } from '../auth/session.js';
import { managementHeaderStyles } from '../theme/styles.js';
/** Does: Opens audited tenant access using explicit identifiers and a reason. Called by: the permission-gated management Access route. */
export function ManagementAccessPage() {
  const { state, reload } = useSession();
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const permissions =
    state.status === 'ready' ? (state.session?.platformPermissions ?? []) : [];
  const impersonate = permissions.includes(
    'admin-tenancy::control::impersonate'
  );
  const direct = permissions.includes('admin-tenancy::control::access');
  /** Does: Checks form input and enters the requested audited context. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!values.user) delete values.user;
    const parsed = accessBodySchema.safeParse(values);
    if (!parsed.success || (!direct && !parsed.data.user)) {
      setMessage('Enter valid identifiers and a reason.');
      return;
    }
    setBusy(true);
    const result = await access(parsed.data);
    if (result.ok) {
      reload();
      void navigate(`/app/${parsed.data.target}/dashboard`);
    } else {
      setMessage(result.error.message);
      setBusy(false);
    }
  }
  return (
    <Box>
      <Toolbar sx={managementHeaderStyles}>
        <Typography component="h1" variant="h5">
          Access
        </Typography>
      </Toolbar>
      <Stack
        component="form"
        spacing={2}
        sx={{ p: 3, maxWidth: 640 }}
        onSubmit={e => void submit(e)}
      >
        <Typography>
          Enter a tenant with an audited reason. Impersonation uses the selected
          user's permissions.
        </Typography>
        {message && <Alert severity="error">{message}</Alert>}
        <TextField
          name="target"
          label="Target tenant ID"
          defaultValue={query.get('target') ?? ''}
          required
        />
        {impersonate && (
          <TextField
            name="user"
            label={
              direct
                ? 'Impersonated user ID (optional)'
                : 'Impersonated user ID'
            }
            required={!direct}
          />
        )}
        <TextField name="reason" label="Reason" required />
        <Button type="submit" disabled={busy || (!direct && !impersonate)}>
          Enter tenant
        </Button>
      </Stack>
    </Box>
  );
}
