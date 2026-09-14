/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Stack,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { controlBodySchema } from '@nap/shared';
import { command } from '../api/control.js';
import { useSession } from '../auth/session.js';
import { useShell } from '../shell/scope.js';
import { managementHeaderStyles } from '../theme/styles.js';
/**
 * Does: Provides identifier-based commands when an operator cannot list records.
 * Called by: tenant and portal-user destinations without overview permission.
 * Why: moving the control page must preserve independently granted command access.
 */
export function ManagementCommandsPage() {
  const { state } = useSession();
  const scope = useShell();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const permissions =
    state.status === 'ready' ? (state.session?.platformPermissions ?? []) : [];
  const can = (action: string) =>
    permissions.includes(`admin-tenancy::control::${action}`);
  const forms = scope.portalUsers
    ? [
        {
          title: 'Create or link portal user',
          operation: 'member',
          permission: 'members',
          fields: [
            ['target', 'Tenant ID'],
            ['kind', 'Relationship: employee, client or vendor'],
            ['name', 'Person name'],
            ['email', 'Email'],
            ['password', 'Temporary password for new user'],
          ],
        },
        {
          title: 'Revoke membership',
          operation: 'revoke',
          permission: 'members',
          fields: [
            ['membership', 'Membership ID'],
            ['reason', 'Reason'],
          ],
        },
      ]
    : [
        {
          title: 'Create tenant',
          operation: 'tenant',
          permission: 'registry',
          fields: [
            ['code', 'Tenant code'],
            ['name', 'Tenant name'],
            ['tier', 'Tier: starter, growth or enterprise'],
            ['cell', 'Enabled cell ID'],
          ],
        },
        {
          title: 'Update tenant tier or pending assignment',
          operation: 'tenant-update',
          permission: 'registry',
          fields: [
            ['target', 'Tenant ID'],
            ['tier', 'Tier: starter, growth or enterprise'],
            ['cell', 'Enabled cell ID'],
          ],
        },
        {
          title: 'Update tenant status',
          operation: 'status',
          permission: 'registry',
          fields: [
            ['target', 'Tenant ID'],
            ['status', 'Status: active or suspended'],
            ['reason', 'Reason'],
          ],
        },
        {
          title: 'Activate tenant',
          operation: 'activate',
          permission: 'provision',
          fields: [
            ['target', 'Tenant ID'],
            ['administrator', 'Initial administrator membership ID'],
          ],
        },
        {
          title: 'Retry provisioning',
          operation: 'retry',
          permission: 'provision',
          fields: [
            ['job', 'Job ID'],
            ['name', 'Person name, required before first record creation'],
          ],
        },
      ];
  /** Does: Sends one validated command and reports its saved job identifier. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    for (const key of ['password', 'administrator', 'name'])
      if (values[key] === '') delete values[key];
    const parsed = controlBodySchema.safeParse(values);
    if (!parsed.success) {
      setMessage('Check the fields and try again.');
      return;
    }
    setBusy(true);
    const result = await command(parsed.data);
    const password = form.elements.namedItem('password');
    if (password instanceof HTMLInputElement) password.value = '';
    setBusy(false);
    setMessage(
      result.ok
        ? `Saved.${result.body.data.jobId ? ` Job ID: ${result.body.data.jobId}. Use Retry provisioning with the person name to complete the saved job.` : ''} An operator with overview permission can verify completion.`
        : result.error.message
    );
  }
  return (
    <Box>
      <Toolbar sx={managementHeaderStyles}>
        <Typography component="h1" variant="h5">
          {scope.portalUsers ? 'Portal users' : 'Tenants'}
        </Typography>
      </Toolbar>
      <Stack spacing={3} sx={{ p: 3, maxWidth: 680 }}>
        <Alert severity="info">
          Your permissions allow commands using known identifiers. Listing
          records requires overview permission.
        </Alert>
        {message && <Alert severity="info">{message}</Alert>}
        {forms
          .filter(form => can(form.permission))
          .map(form => (
            <Box component="details" key={form.operation}>
              <Typography component="summary">{form.title}</Typography>
              <Stack
                component="form"
                spacing={2}
                sx={{ pt: 2 }}
                onSubmit={e => void submit(e)}
              >
                <input type="hidden" name="operation" value={form.operation} />
                {form.fields.map(([name, label]) => (
                  <TextField
                    key={name}
                    name={name}
                    label={label}
                    type={name === 'password' ? 'password' : 'text'}
                    required={
                      !['password', 'administrator'].includes(name ?? '') &&
                      !(form.operation === 'retry' && name === 'name')
                    }
                  />
                ))}
                <Button disabled={busy} type="submit">
                  {form.title}
                </Button>
              </Stack>
            </Box>
          ))}
      </Stack>
    </Box>
  );
}
