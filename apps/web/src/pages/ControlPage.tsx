/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import {
  controlBodySchema,
  controlResponseSchema,
  platformPermissions,
  accessBodySchema,
} from '@nap/shared';
import { z } from 'zod';
import { overview, command, access, getAudit } from '../api/control.js';
import { useSession } from '../auth/session.js';
import { SessionStatus } from '../auth/SessionStatus.js';
import type { FormEvent } from 'react';

/** Does: Provides bounded registry, membership, provisioning and grant forms. Called by: operator route. */
export function ControlPage() {
  const { state, reload } = useSession();
  const [data, setData] = useState<
    z.infer<typeof controlResponseSchema>['data'] | null
  >(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [events, setEvents] = useState<string[]>([]);
  const permissions =
    state.status === 'ready' ? (state.session?.platformPermissions ?? []) : [];
  const canOverview = permissions.includes('admin-tenancy::control::overview');
  useEffect(() => {
    if (!canOverview) return;
    let active = true;
    void overview().then(result => {
      if (!active) return;
      if (result.ok) setData(result.body.data);
      else setMessage(result.error.message);
    });
    return () => {
      active = false;
    };
  }, [revision, canOverview]);
  /** Does: Validates and submits one form, keeping secrets out of returned state. Called by: operator command forms. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values: Record<string, unknown> = Object.fromEntries(
      new FormData(form)
    );
    if (values.enabled !== undefined)
      values.enabled = values.enabled === 'true';
    if (values.password === '') delete values.password;
    const parsed = controlBodySchema.safeParse(values);
    if (!parsed.success) {
      setMessage('Check the fields and try again.');
      return;
    }
    setBusy(true);
    setMessage('');
    const result = await command(parsed.data);
    setBusy(false);
    const password = form.elements.namedItem('password');
    if (password instanceof HTMLInputElement) password.value = '';
    if (result.ok) {
      setMessage('Saved. Check provisioning status before activation.');
      setRevision(v => v + 1);
    } else setMessage(result.error.message);
  }
  /** Does: Validates the reason and target before entering controlled access. Called by: access form. */
  async function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!values.user) delete values.user;
    const parsed = accessBodySchema.safeParse(values);
    if (!parsed.success) {
      setMessage('Enter a valid target and reason.');
      return;
    }
    setBusy(true);
    const result = await access(parsed.data);
    if (result.ok) reload();
    else {
      setMessage(result.error.message);
      setBusy(false);
    }
  }
  /** Does: Loads the authorized audit view. Called by: review button. */
  async function audit() {
    setBusy(true);
    const result = await getAudit();
    setBusy(false);
    if (result.ok)
      setEvents(
        result.body.data.map(
          e =>
            `${e.created_at} — ${e.event} — ${e.operator_id} — ${e.target_id ?? ''} — ${e.reason}`
        )
      );
    else setMessage(result.error.message);
  }
  if (state.status !== 'ready') return <SessionStatus />;
  if (!state.session) return <Navigate to="/login?next=%2Fcontrol" replace />;
  if (
    state.session.state === 'password-change-required' ||
    state.session.controlledAccess
  )
    return <Navigate to="/account" replace />;
  if (!permissions.length)
    return <Alert severity="error">Access denied.</Alert>;
  /** Does: Checks whether this session advertises a form's permission. Called by: this page's form layout. */
  const can = (action: string) =>
    permissions.includes(`admin-tenancy::control::${action}`);
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Typography variant="h4" component="h1">
          Administration
        </Typography>
        <Button component={Link} to="/account">
          Account
        </Button>
        {message && <Alert severity="info">{message}</Alert>}
        {can('registry') && (
          <>
            <Box
              component="details"
              open
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
            >
              <Box component="summary" sx={{ cursor: 'pointer' }}>
                <Typography component="span" variant="h6">
                  Register or update cell
                </Typography>
              </Box>
              <Stack
                component="form"
                spacing={2}
                onSubmit={e => void submit(e)}
                sx={{ pt: 2 }}
              >
                <input type="hidden" name="operation" value="cell" />
                <TextField name="code" label="Cell code" required />
                <TextField name="name" label="Cell name" required />
                <TextField
                  select
                  name="enabled"
                  label="Availability"
                  defaultValue="true"
                >
                  <MenuItem value="true">Enabled</MenuItem>
                  <MenuItem value="false">Disabled</MenuItem>
                </TextField>
                <Button type="submit" disabled={busy}>
                  Save cell
                </Button>
              </Stack>
            </Box>
            <Divider />
            <Box
              component="details"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
            >
              <Box component="summary" sx={{ cursor: 'pointer' }}>
                <Typography component="span" variant="h6">
                  Register tenant
                </Typography>
              </Box>
              <Stack
                component="form"
                spacing={2}
                onSubmit={e => void submit(e)}
                sx={{ pt: 2 }}
              >
                <input type="hidden" name="operation" value="tenant" />
                <TextField name="code" label="Tenant code" required />
                <TextField name="name" label="Company" required />
                <TextField
                  select
                  name="tier"
                  label="Tier"
                  defaultValue="starter"
                >
                  {['starter', 'growth', 'enterprise'].map(t => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  name="cell"
                  label="Assigned cell"
                  defaultValue=""
                  required
                >
                  {(data?.cells ?? [])
                    .filter(c => c.enabled)
                    .map(c => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                </TextField>
                <Button type="submit" disabled={busy}>
                  Create pending tenant
                </Button>
              </Stack>
            </Box>
            <Box
              component="details"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
            >
              <Box component="summary" sx={{ cursor: 'pointer' }}>
                <Typography component="span" variant="h6">
                  Update tenant tier or pending assignment
                </Typography>
              </Box>
              <Stack
                component="form"
                spacing={2}
                onSubmit={e => void submit(e)}
                sx={{ pt: 2 }}
              >
                <input type="hidden" name="operation" value="tenant-update" />
                <TextField name="target" label="Tenant ID" required />
                <TextField
                  select
                  name="tier"
                  label="Tier"
                  defaultValue="starter"
                >
                  {['starter', 'growth', 'enterprise'].map(t => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  name="cell"
                  label="Assigned cell"
                  defaultValue=""
                  required
                >
                  {(data?.cells ?? [])
                    .filter(c => c.enabled)
                    .map(c => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.name}
                      </MenuItem>
                    ))}
                </TextField>
                <Button type="submit" disabled={busy}>
                  Update tenant
                </Button>
              </Stack>
            </Box>
            <Box
              component="details"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
            >
              <Box component="summary" sx={{ cursor: 'pointer' }}>
                <Typography component="span" variant="h6">
                  Suspend or resume tenant
                </Typography>
              </Box>
              <Stack
                component="form"
                spacing={2}
                onSubmit={e => void submit(e)}
                sx={{ pt: 2 }}
              >
                <input type="hidden" name="operation" value="status" />
                <TextField name="target" label="Tenant ID" required />
                <TextField
                  select
                  name="status"
                  label="Status"
                  defaultValue="suspended"
                >
                  <MenuItem value="suspended">Suspended</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                </TextField>
                <TextField name="reason" label="Reason" required />
                <Button type="submit" disabled={busy}>
                  Update status
                </Button>
              </Stack>
            </Box>
          </>
        )}
        {can('members') && (
          <>
            <Divider />
            <Box
              component="details"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
            >
              <Box component="summary" sx={{ cursor: 'pointer' }}>
                <Typography component="span" variant="h6">
                  Provision application user
                </Typography>
              </Box>
              <Stack
                component="form"
                spacing={2}
                onSubmit={e => void submit(e)}
                sx={{ pt: 2 }}
              >
                <input type="hidden" name="operation" value="member" />
                <TextField
                  select
                  name="target"
                  label="Tenant"
                  defaultValue=""
                  required
                >
                  {(data?.tenants ?? []).map(t => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.company}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  name="kind"
                  label="Relationship"
                  defaultValue="employee"
                >
                  {['employee', 'client', 'vendor'].map(k => (
                    <MenuItem key={k} value={k}>
                      {k}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField name="name" label="Name" required />
                <TextField name="email" label="Email" type="email" required />
                <TextField
                  name="password"
                  label="Temporary password for new user"
                  type="password"
                  autoComplete="new-password"
                  helperText="12–128 characters; share with the user outside NAP."
                />
                <Button type="submit" disabled={busy}>
                  Provision user
                </Button>
              </Stack>
            </Box>
            <Box
              component="details"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
            >
              <Box component="summary" sx={{ cursor: 'pointer' }}>
                <Typography component="span" variant="h6">
                  Revoke membership
                </Typography>
              </Box>
              <Stack
                component="form"
                spacing={2}
                onSubmit={e => void submit(e)}
                sx={{ pt: 2 }}
              >
                <input type="hidden" name="operation" value="revoke" />
                <TextField name="membership" label="Membership ID" required />
                <TextField name="reason" label="Reason" required />
                <Button type="submit" disabled={busy}>
                  Revoke access
                </Button>
              </Stack>
            </Box>
          </>
        )}
        {can('provision') && (
          <>
            <Divider />
            <Box
              component="details"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
            >
              <Box component="summary" sx={{ cursor: 'pointer' }}>
                <Typography component="span" variant="h6">
                  Reconcile operator tenant
                </Typography>
              </Box>
              <Stack
                component="form"
                spacing={2}
                onSubmit={e => void submit(e)}
                sx={{ pt: 2 }}
              >
                <input type="hidden" name="operation" value="reconcile" />
                <TextField
                  select
                  name="cell"
                  label="Configured cell"
                  defaultValue=""
                  required
                >
                  {(data?.cells ?? []).map(c => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </TextField>
                <Button type="submit" disabled={busy}>
                  Reconcile
                </Button>
              </Stack>
            </Box>
            <Box
              component="details"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
            >
              <Box component="summary" sx={{ cursor: 'pointer' }}>
                <Typography component="span" variant="h6">
                  Activate tenant
                </Typography>
              </Box>
              <Stack
                component="form"
                spacing={2}
                onSubmit={e => void submit(e)}
                sx={{ pt: 2 }}
              >
                <input type="hidden" name="operation" value="activate" />
                <TextField
                  select
                  name="target"
                  label="Pending tenant"
                  defaultValue=""
                  required
                >
                  {(data?.tenants ?? [])
                    .filter(t => t.status === 'pending')
                    .map(t => (
                      <MenuItem key={t.id} value={t.id}>
                        {t.company}
                      </MenuItem>
                    ))}
                </TextField>
                <Button type="submit" disabled={busy}>
                  Verify and activate
                </Button>
              </Stack>
            </Box>
            <Box
              component="details"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
            >
              <Box component="summary" sx={{ cursor: 'pointer' }}>
                <Typography component="span" variant="h6">
                  Retry synchronization
                </Typography>
              </Box>
              <Stack
                component="form"
                spacing={2}
                onSubmit={e => void submit(e)}
                sx={{ pt: 2 }}
              >
                <input type="hidden" name="operation" value="retry" />
                <TextField name="job" label="Job ID" required />
                <TextField
                  name="name"
                  label="Person name"
                  required
                  helperText="Needed if the original cell record could not be saved."
                />
                <Button type="submit" disabled={busy}>
                  Retry
                </Button>
              </Stack>
            </Box>
          </>
        )}
        {can('grants') && (
          <>
            <Divider />
            <Box
              component="details"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
            >
              <Box component="summary" sx={{ cursor: 'pointer' }}>
                <Typography component="span" variant="h6">
                  Platform permissions
                </Typography>
              </Box>
              <Stack
                component="form"
                spacing={2}
                onSubmit={e => void submit(e)}
                sx={{ pt: 2 }}
              >
                <input type="hidden" name="operation" value="grant" />
                <TextField name="user" label="Portal user ID" required />
                <TextField
                  select
                  name="role"
                  label="Role"
                  defaultValue="support"
                >
                  <MenuItem value="support">Support</MenuItem>
                  <MenuItem value="package_admin">
                    Package administrator
                  </MenuItem>
                </TextField>
                <TextField
                  select
                  name="permission"
                  label="Permission"
                  defaultValue={platformPermissions[0]}
                >
                  {platformPermissions.map(p => (
                    <MenuItem key={p} value={p}>
                      {p.split('::').at(-1)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  name="enabled"
                  label="Grant"
                  defaultValue="true"
                >
                  <MenuItem value="true">Allow</MenuItem>
                  <MenuItem value="false">Revoke</MenuItem>
                </TextField>
                <Button type="submit" disabled={busy}>
                  Save grant
                </Button>
              </Stack>
            </Box>
          </>
        )}
        {(can('access') || can('impersonate')) && (
          <>
            <Divider />
            <Box
              component="details"
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2 }}
            >
              <Box component="summary" sx={{ cursor: 'pointer' }}>
                <Typography component="span" variant="h6">
                  Controlled access
                </Typography>
              </Box>
              <Stack
                component="form"
                spacing={2}
                onSubmit={e => void enter(e)}
                sx={{ pt: 2 }}
              >
                <TextField name="target" label="Target tenant ID" required />
                {can('impersonate') && (
                  <TextField
                    name="user"
                    label="Impersonated user ID (optional)"
                  />
                )}
                <TextField name="reason" label="Reason" required />
                <Button type="submit" disabled={busy}>
                  Enter tenant
                </Button>
              </Stack>
            </Box>
          </>
        )}
        {data && (
          <>
            <Divider />
            <Typography variant="h6">Tenant and provisioning status</Typography>
            {data.tenants.map(t => (
              <Typography key={t.id}>
                {t.company}: {t.status} — {t.id}
              </Typography>
            ))}
            {data.members.map(m => (
              <Typography key={m.id}>
                Membership {m.id} — user {m.portal_user_id} — {m.status}
                {m.ready ? '' : ' (not ready)'}
              </Typography>
            ))}
            {data.jobs.map(j => (
              <Typography key={j.id}>
                Job {j.id}: {j.stage} {j.failure_code}
              </Typography>
            ))}
          </>
        )}
        {can('audit') && (
          <Button onClick={() => void audit()} disabled={busy}>
            Review audit
          </Button>
        )}
        {events.map((e, i) => (
          <Typography key={i} variant="body2">
            {e}
          </Typography>
        ))}
      </Stack>
    </Container>
  );
}
