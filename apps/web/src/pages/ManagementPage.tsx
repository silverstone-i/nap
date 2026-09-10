/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TableContainer from '@mui/material/TableContainer';
import TablePagination from '@mui/material/TablePagination';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { controlBodySchema, accessBodySchema } from '@nap/shared';
import type { controlResponseSchema } from '@nap/shared';
import type { z } from 'zod';
import type { FormEvent } from 'react';
import { overview, command, access } from '../api/control.js';
import { getSession } from '../api/auth.js';
import { requestGeneration } from '../api/lifecycle.js';
import { useSession } from '../auth/session.js';
import { useShell } from '../shell/scope.js';
import { defaultRowsPerPage } from '../lib/settings.js';

/**
 * Does: Presents the existing tenant and identity provisioning workflow with record choices.
 * Called by: both Tenant Management destinations.
 */
export function ManagementPage() {
  const scope = useShell();
  const { state, setSession } = useSession();
  const navigate = useNavigate();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [data, setData] = useState<
    z.infer<typeof controlResponseSchema>['data'] | null
  >(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  const session = state.status === 'ready' ? state.session : null;
  /**
   * Does: Checks the current central action permission for a form.
   * Called by: this page's form rendering.
   */
  function can(action: string) {
    return (
      session?.platformPermissions.includes(
        `admin-tenancy::control::${action}`
      ) ?? false
    );
  }
  useEffect(() => {
    let active = true;
    void overview().then(result => {
      if (!active) return;
      if (result.ok) setData(result.body.data);
      else {
        setData(null);
        setMessage(result.error.message);
      }
    });
    return () => {
      active = false;
    };
  }, [revision]);
  /**
   * Does: Runs a validated provisioning command and refreshes its durable progress.
   * Called by: tenant, member, retry and activation forms.
   */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values: Record<string, unknown> = Object.fromEntries(
      new FormData(form)
    );
    if (!values.password) delete values.password;
    if (!values.administrator) delete values.administrator;
    const parsed = controlBodySchema.safeParse(values);
    if (!parsed.success) {
      setMessage('Check the fields and try again.');
      return;
    }
    setBusy(true);
    setMessage('');
    const generation = requestGeneration();
    const result = await command(parsed.data);
    const password = form.elements.namedItem('password');
    if (password instanceof HTMLInputElement) password.value = '';
    if (!mounted.current || generation !== requestGeneration()) return;
    setBusy(false);
    setMessage(
      result.ok
        ? 'Saved. Provisioning status has been refreshed.'
        : result.error.message
    );
    setRevision(v => v + 1);
    if (result.ok && scope.create) {
      await navigate(
        scope.portalUsers && scope.target
          ? `/management/tenants/${scope.target}`
          : '/management/tenants'
      );
    }
  }
  /**
   * Does: Starts audited employee access only after an explicit reason is submitted.
   * Called by: the selected tenant's employee inspection form.
   */
  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = accessBodySchema.safeParse({
      target: scope.target,
      reason: values.reason,
    });
    if (!parsed.success || typeof values.record !== 'string') {
      setMessage('Choose an employee and enter a reason.');
      return;
    }
    setBusy(true);
    const generation = requestGeneration();
    const result = await access(parsed.data);
    if (!mounted.current || generation !== requestGeneration()) return;
    if (result.ok) {
      const checked = await getSession();
      if (!mounted.current || generation !== requestGeneration()) return;
      if (checked.ok && checked.body.data.tenantId === scope.target) {
        setSession(checked.body.data);
        await navigate(
          `/app/${scope.target}/accounting/directories?tab=employees&record=${encodeURIComponent(values.record)}`
        );
        return;
      }
      setData(null);
      setMessage(
        'Access changed. Return to the application to reload the session.'
      );
    } else setMessage(result.error.message);
    setBusy(false);
  }
  if (scope.create && !can(scope.portalUsers ? 'members' : 'registry'))
    return <Alert severity="warning">This action is unavailable.</Alert>;
  if (!data)
    return message ? (
      <Alert severity="error">
        {message}
        <Button onClick={() => setRevision(v => v + 1)}>Retry</Button>
      </Alert>
    ) : (
      <Typography role="status">Loading provisioning records…</Typography>
    );
  const tenant = data.tenants.find(t => t.id === scope.target);
  const members = data.members.filter(m => m.tenant_id === tenant?.id);
  const employees = members.filter(
    m => m.user_type === 'employee' && m.ready && m.status === 'active'
  );
  const jobs = data.jobs.filter(j => j.tenant_id === tenant?.id);
  const size = defaultRowsPerPage();
  const page = Math.min(
    scope.page,
    Math.max(
      0,
      Math.ceil((scope.portalUsers ? data.users : data.tenants).length / size) -
        1
    )
  );
  /**
   * Does: Finds a display label from the authorized overview.
   * Called by: membership and job choices.
   */
  function userName(id: string) {
    return data?.users.find(u => u.id === id)?.email ?? id;
  }
  if (scope.target && !tenant)
    return <Alert severity="warning">Tenant unavailable.</Alert>;
  return (
    <Stack spacing={3}>
      {message && <Alert severity="info">{message}</Alert>}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        useFlexGap
        sx={{ flexWrap: 'wrap' }}
      >
        <Button component={Link} to="/management/tenants">
          All tenants
        </Button>
        <Button component={Link} to="/management/portal-users">
          Portal users
        </Button>
        <Button component={Link} to="/control">
          Operator utilities
        </Button>
        {!scope.create && can('registry') && !scope.portalUsers && (
          <Button component={Link} to="/management/tenants/new">
            Create tenant
          </Button>
        )}
        {!scope.create && can('members') && (
          <Button
            component={Link}
            to={`/management/portal-users/new${tenant ? `?target=${tenant.id}` : ''}`}
          >
            Create or link portal user
          </Button>
        )}
        <Button
          onClick={() => {
            setData(null);
            setRevision(v => v + 1);
          }}
        >
          Refresh
        </Button>
      </Stack>
      {scope.create ? (
        scope.portalUsers ? (
          can('members') && (
            <Stack component="form" spacing={2} onSubmit={e => void submit(e)}>
              <Typography component="h2" variant="h6">
                Create or link portal user
              </Typography>
              <input type="hidden" name="operation" value="member" />
              <TextField
                select
                name="target"
                label="Tenant"
                defaultValue={scope.target ?? ''}
                required
              >
                {data.tenants.map(t => (
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
                required
              >
                {['employee', 'client', 'vendor'].map(kind => (
                  <MenuItem key={kind} value={kind}>
                    {kind}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                name="name"
                label="Employee or contact name"
                required
              />
              <TextField
                name="email"
                label="Portal user email"
                type="email"
                required
                helperText="An existing email links the identity without changing its credentials."
              />
              <TextField
                name="password"
                label="Temporary password for new user"
                type="password"
                autoComplete="new-password"
                helperText="New identities require 12–128 characters. Share the temporary password outside NAP."
              />
              <Button type="submit" disabled={busy}>
                Provision user
              </Button>
            </Stack>
          )
        ) : (
          can('registry') && (
            <Stack component="form" spacing={2} onSubmit={e => void submit(e)}>
              <Typography component="h2" variant="h6">
                Create pending tenant
              </Typography>
              <input type="hidden" name="operation" value="tenant" />
              <TextField name="code" label="Tenant code" required />
              <TextField name="name" label="Tenant name" required />
              <TextField select name="tier" label="Tier" defaultValue="starter">
                {['starter', 'growth', 'enterprise'].map(tier => (
                  <MenuItem key={tier} value={tier}>
                    {tier}
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
                {data.cells
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
          )
        )
      ) : tenant ? (
        <>
          <Typography component="h2" variant="h6">
            {tenant.company} — {tenant.status}
          </Typography>
          <Typography>
            Projection: {tenant.provisioned ? 'Confirmed' : 'Pending'}
          </Typography>
          <Typography component="h3" variant="h6">
            Portal users and employee provisioning
          </Typography>
          {!members.length && (
            <Typography>
              No memberships yet. Create or link an initial employee
              administrator.
            </Typography>
          )}
          {members.map(m => (
            <Typography key={m.id}>
              {userName(m.portal_user_id)} — {m.user_type} — {m.status} —{' '}
              {m.ready ? 'Record confirmed' : 'Record pending'}
            </Typography>
          ))}
          <Typography component="h3" variant="h6">
            Provisioning jobs
          </Typography>
          {!jobs.length && <Typography>No provisioning jobs.</Typography>}
          {jobs.map(j => (
            <Typography key={j.id}>
              {j.kind} — {j.stage}
              {j.failure_code ? ` — ${j.failure_code}` : ''} —{' '}
              {userName(
                members.find(m => m.id === j.membership_id)?.portal_user_id ??
                  ''
              )}
            </Typography>
          ))}
          {can('provision') && jobs.length > 0 && (
            <Stack component="form" spacing={2} onSubmit={e => void submit(e)}>
              <Typography component="h3" variant="h6">
                Retry synchronization
              </Typography>
              <input type="hidden" name="operation" value="retry" />
              <TextField
                select
                name="job"
                label="Provisioning job"
                defaultValue=""
                required
              >
                {jobs.map(j => (
                  <MenuItem key={j.id} value={j.id}>
                    {j.kind} — {j.stage} —{' '}
                    {userName(
                      members.find(m => m.id === j.membership_id)
                        ?.portal_user_id ?? ''
                    )}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                name="name"
                label="Employee or contact name"
                required
                helperText="Used if the original record could not be saved."
              />
              <Button type="submit" disabled={busy}>
                Retry provisioning
              </Button>
            </Stack>
          )}
          {can('provision') && tenant.status === 'pending' && (
            <Stack component="form" spacing={2} onSubmit={e => void submit(e)}>
              <Typography component="h3" variant="h6">
                Activate tenant
              </Typography>
              <input type="hidden" name="operation" value="activate" />
              <input type="hidden" name="target" value={tenant.id} />
              <TextField
                select
                name="administrator"
                label="Initial administrator"
                defaultValue=""
                required
              >
                {employees.map(m => (
                  <MenuItem key={m.id} value={m.id}>
                    {userName(m.portal_user_id)}
                  </MenuItem>
                ))}
              </TextField>
              <Typography>
                The server verifies the employee, projections, role seed and
                isolation before activation.
              </Typography>
              <Button type="submit" disabled={busy || !employees.length}>
                Verify and activate
              </Button>
            </Stack>
          )}
          {can('access') &&
            tenant.status === 'active' &&
            employees.length > 0 && (
              <Stack
                component="form"
                spacing={2}
                onSubmit={e => void inspect(e)}
              >
                <Typography component="h3" variant="h6">
                  Inspect employee with controlled access
                </Typography>
                <TextField
                  select
                  name="record"
                  label="Employee"
                  defaultValue=""
                  required
                >
                  {employees
                    .filter(m => m.entity_id)
                    .map(m => (
                      <MenuItem key={m.id} value={m.entity_id ?? ''}>
                        {userName(m.portal_user_id)}
                      </MenuItem>
                    ))}
                </TextField>
                <TextField name="reason" label="Access reason" required />
                <Button type="submit" disabled={busy}>
                  Enter controlled access
                </Button>
              </Stack>
            )}
        </>
      ) : (
        <>
          <TableContainer>
            <Table aria-label={scope.portalUsers ? 'Portal users' : 'Tenants'}>
              <TableHead>
                <TableRow>
                  <TableCell>
                    {scope.portalUsers ? 'Email' : 'Tenant'}
                  </TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>
                    {scope.portalUsers ? 'Tenant memberships' : 'Provisioning'}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {scope.portalUsers
                  ? data.users.slice(page * size, (page + 1) * size).map(u => (
                      <TableRow key={u.id}>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>{u.status}</TableCell>
                        <TableCell>
                          {data.members
                            .filter(m => m.portal_user_id === u.id)
                            .map(m => (
                              <Button
                                key={m.id}
                                component={Link}
                                to={`/management/tenants/${m.tenant_id}`}
                              >
                                {data.tenants.find(t => t.id === m.tenant_id)
                                  ?.company ?? 'Tenant'}{' '}
                                — {m.status}
                              </Button>
                            ))}
                        </TableCell>
                      </TableRow>
                    ))
                  : data.tenants
                      .slice(page * size, (page + 1) * size)
                      .map(t => (
                        <TableRow key={t.id}>
                          <TableCell>
                            <Button
                              component={Link}
                              to={`/management/tenants/${t.id}`}
                            >
                              {t.company}
                            </Button>
                          </TableCell>
                          <TableCell>{t.status}</TableCell>
                          <TableCell>
                            {t.provisioned ? 'Confirmed' : 'Pending'}
                          </TableCell>
                        </TableRow>
                      ))}
              </TableBody>
            </Table>
          </TableContainer>
          {(scope.portalUsers ? data.users : data.tenants).length === 0 && (
            <Typography>No records available.</Typography>
          )}
          <TablePagination
            component="div"
            count={(scope.portalUsers ? data.users : data.tenants).length}
            page={page}
            rowsPerPage={size}
            rowsPerPageOptions={[size]}
            onPageChange={(_event, value) =>
              void navigate(
                `/management/${scope.portalUsers ? 'portal-users' : 'tenants'}?page=${value}`
              )
            }
          />
        </>
      )}
    </Stack>
  );
}
