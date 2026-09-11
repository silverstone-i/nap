/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useEffect, useState, useRef, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Menu from '@mui/material/Menu';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { DataGrid, type GridColDef } from '@mui/x-data-grid';
import {
  managementHeaderStyles,
  managementContentStyles,
  managementGridStyles,
  managementFormStyles,
} from '../theme/styles.js';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
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
 * Does: Describes the display fields shared by tenant and portal-user rows.
 * Used by: Management DataGrid column renderers.
 */
type ManagementRow = Pick<
  z.infer<typeof controlResponseSchema>['data']['tenants'][number],
  'id' | 'status'
> & { label: string; summary: string; code?: string };

/**
 * Does: Presents the existing tenant and identity provisioning workflow with record choices.
 * Called by: both Tenant Management destinations.
 */
export function ManagementPage() {
  const scope = useShell();
  const { state, setSession } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [action, setAction] = useState('');
  const [rowMenu, setRowMenu] = useState<{
    anchor: HTMLElement;
    id: string;
  } | null>(null);
  const [severity, setSeverity] = useState<'error' | 'success' | 'warning'>(
    'error'
  );
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
      if (result.ok) {
        setData(result.body.data);
        setMessage('');
      } else {
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
    setSeverity('error');
    const form = event.currentTarget;
    const values: Record<string, unknown> = Object.fromEntries(
      new FormData(form)
    );
    if (!values.password) delete values.password;
    if (!values.administrator) delete values.administrator;
    if (values.operation === 'retry' && !values.name) delete values.name;
    const parsed = controlBodySchema.safeParse(values);
    if (!parsed.success) {
      setMessage(
        parsed.error.issues
          .map(issue => `${issue.path.join('.')}: ${issue.message}`)
          .join(' ')
      );
      return;
    }
    setBusy(true);
    setSeverity('error');
    setMessage('');
    const generation = requestGeneration();
    const result = await command(parsed.data);
    const password = form.elements.namedItem('password');
    if (password instanceof HTMLInputElement) password.value = '';
    if (!mounted.current || generation !== requestGeneration()) return;
    const refreshed = await overview();
    if (!mounted.current || generation !== requestGeneration()) return;
    setBusy(false);
    if (refreshed.ok) setData(refreshed.body.data);
    else setData(null);
    const jobId =
      result.jobId ??
      (parsed.data.operation === 'retry' ? parsed.data.job : null);
    const job = refreshed.ok
      ? refreshed.body.data.jobs.find(j => j.id === jobId)
      : undefined;
    setSeverity(
      !result.ok || !refreshed.ok
        ? 'error'
        : jobId && job?.stage !== 'complete'
          ? 'warning'
          : 'success'
    );
    setMessage(
      !refreshed.ok
        ? `Status unavailable. ${refreshed.error.message}${jobId ? ` Saved job: ${jobId}. Refresh status before retrying; do not create another membership.` : ''}`
        : !result.ok
          ? `${result.error.message}${jobId ? ' Retry the existing provisioning job; do not create another membership.' : ''}`
          : jobId
            ? job?.stage === 'complete'
              ? 'Provisioning complete. Review tenant readiness before activation.'
              : job?.stage === 'failed'
                ? `Provisioning failed${job.failure_code ? ` (${job.failure_code})` : ''}. Retry the existing job.`
                : 'Provisioning is pending or its status is unavailable. Refresh status before retrying the existing job.'
            : 'Saved.'
    );
    if (result.ok) setAction('');
    if (
      scope.create &&
      (result.ok || (parsed.data.operation === 'member' && jobId))
    ) {
      const createdCode =
        parsed.data.operation === 'tenant' ? parsed.data.code : null;
      const createdTenant =
        refreshed.ok && createdCode
          ? refreshed.body.data.tenants.find(t => t.tenant_code === createdCode)
          : undefined;
      const destination =
        scope.portalUsers && scope.target
          ? `/management/tenants/${scope.target}`
          : scope.portalUsers
            ? '/management/portal-users'
            : createdTenant
              ? `/management/tenants/${createdTenant.id}`
              : '/management/tenants';
      await navigate(
        `${destination}${jobId ? `?job=${encodeURIComponent(jobId)}` : ''}`
      );
    }
  }
  /**
   * Does: Starts audited employee access only after an explicit reason is submitted.
   * Called by: the selected tenant's employee inspection form.
   */
  async function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSeverity('error');
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
  /** Does: Updates list navigation without dropping unrelated view parameters. */
  function changeView(values: Record<string, string>, replace = false) {
    const query = new URLSearchParams(location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    void navigate(`${location.pathname}?${query}`, { replace });
  }
  const columns = useMemo<GridColDef<ManagementRow>[]>(
    () => [
      {
        field: 'label',
        headerName: scope.portalUsers ? 'Email' : 'Tenant',
        flex: 1,
        minWidth: 220,
        renderCell: params => (
          <Button
            component={Link}
            tabIndex={params.hasFocus ? 0 : -1}
            to={
              scope.portalUsers
                ? `/management/portal-users?record=${params.row.id}`
                : `/management/tenants/${params.row.id}`
            }
          >
            {params.row.label}
          </Button>
        ),
      },
      ...(!scope.portalUsers
        ? [{ field: 'code', headerName: 'Code', width: 130 }]
        : []),
      {
        field: 'status',
        headerName: 'Status',
        width: 135,
        renderCell: params => (
          <Chip
            size="small"
            variant="outlined"
            label={params.row.status}
            color={
              params.row.status === 'active'
                ? 'success'
                : params.row.status === 'pending'
                  ? 'warning'
                  : 'default'
            }
          />
        ),
      },
      {
        field: 'summary',
        headerName: scope.portalUsers ? 'Tenant memberships' : 'Provisioning',
        flex: 1,
        minWidth: 180,
      },
      {
        field: 'actions',
        headerName: 'Actions',
        width: 85,
        sortable: false,
        filterable: false,
        renderCell: params => (
          <IconButton
            size="small"
            tabIndex={params.hasFocus ? 0 : -1}
            aria-label={`Actions for ${params.row.label}`}
            aria-haspopup="menu"
            onClick={event =>
              setRowMenu({ anchor: event.currentTarget, id: params.row.id })
            }
          >
            <MoreVertIcon />
          </IconButton>
        ),
      },
    ],
    [scope.portalUsers]
  );
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
  const enabledCells = data.cells.filter(c => c.enabled);
  const assignedCell = data.cells.find(c => c.id === tenant?.cell_id);
  const pendingMembers = members.some(m => m.status === 'active' && !m.ready);
  const activationBlocked =
    !assignedCell?.enabled || !employees.length || pendingMembers;
  const requestedJob = new URLSearchParams(location.search).get('job');
  const savedJob = data.jobs.find(j => j.id === requestedJob);
  const savedJobMessage =
    savedJob?.stage === 'complete'
      ? tenant?.status === 'active'
        ? 'Provisioning complete.'
        : 'Provisioning complete. Review tenant readiness before activation.'
      : savedJob?.stage === 'failed'
        ? `Provisioning failed${savedJob.failure_code ? ` (${savedJob.failure_code})` : ''}. Retry the existing job.`
        : 'Provisioning is pending or its status is unavailable. Refresh status before retrying the existing job.';
  const size = defaultRowsPerPage();
  const user = scope.portalUsers
    ? data.users.find(u => u.id === scope.record)
    : undefined;
  const listPath = `/management/${scope.portalUsers ? 'portal-users' : 'tenants'}`;
  const rows = scope.portalUsers
    ? data.users.map(u => ({
        ...u,
        label: u.email,
        summary:
          data.members
            .filter(m => m.portal_user_id === u.id)
            .map(
              m =>
                data.tenants.find(t => t.id === m.tenant_id)?.company ??
                'Tenant unavailable'
            )
            .join(', ') || 'No memberships',
      }))
    : data.tenants.map(t => ({
        ...t,
        label: t.company,
        code: t.tenant_code,
        summary: t.provisioned ? 'Confirmed' : 'Pending',
      }));
  const filtered = rows.filter(
    row =>
      (!scope.status || row.status === scope.status) &&
      `${row.label} ${'code' in row ? row.code : ''} ${row.summary}`
        .toLowerCase()
        .includes(scope.search.toLowerCase())
  );
  const page = Math.min(
    scope.page,
    Math.max(0, Math.ceil(filtered.length / size) - 1)
  );
  const title = scope.create
    ? scope.portalUsers
      ? 'Create or link portal user'
      : 'Create tenant'
    : (user?.email ??
      tenant?.company ??
      (scope.portalUsers ? 'Portal users' : 'Tenants'));
  /**
   * Does: Finds a display label from the authorized overview.
   * Called by: membership and job choices.
   */
  function userName(id: string) {
    return data?.users.find(u => u.id === id)?.email ?? id;
  }
  if (scope.portalUsers && scope.record && !user)
    return <Alert severity="warning">Portal user unavailable.</Alert>;
  if (scope.target && !tenant)
    return <Alert severity="warning">Tenant unavailable.</Alert>;
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: '100%',
      }}
    >
      <Toolbar aria-label="Feature controls" sx={managementHeaderStyles}>
        <Typography
          component="h1"
          variant="h6"
          sx={{ overflowWrap: 'anywhere' }}
        >
          {title}
        </Typography>
        {!scope.create && !tenant && !user && (
          <>
            <TextField
              size="small"
              label={
                scope.portalUsers ? 'Search portal users' : 'Search tenants'
              }
              value={scope.search}
              onChange={event =>
                changeView({ q: event.target.value, page: '' }, true)
              }
            />
            <TextField
              select
              size="small"
              label="Status"
              value={scope.status}
              sx={{ minWidth: 135 }}
              onChange={event =>
                changeView({ status: event.target.value, page: '' })
              }
            >
              <MenuItem value="">All statuses</MenuItem>
              {[
                ...new Set(rows.map(row => row.status)),
                ...(scope.status &&
                !rows.some(row => row.status === scope.status)
                  ? [scope.status]
                  : []),
              ].map(status => (
                <MenuItem key={status} value={status}>
                  {status}
                </MenuItem>
              ))}
            </TextField>
          </>
        )}
        <Box sx={{ flexGrow: 1 }} />
        {(scope.create || tenant || user) && (
          <Button
            component={Link}
            to={
              scope.create && scope.target
                ? `/management/tenants/${scope.target}`
                : listPath
            }
          >
            {scope.create
              ? 'Cancel'
              : scope.portalUsers
                ? 'All portal users'
                : 'All tenants'}
          </Button>
        )}
        {!scope.create &&
          !user &&
          can('registry') &&
          !scope.portalUsers &&
          !tenant && (
            <Button
              variant="contained"
              component={Link}
              to="/management/tenants/new"
              disabled={!enabledCells.length}
            >
              Create tenant
            </Button>
          )}
        {!scope.create && can('members') && (scope.portalUsers || tenant) && (
          <Button
            variant="contained"
            component={Link}
            to={`/management/portal-users/new${tenant ? `?target=${tenant.id}` : user ? `?record=${user.id}` : ''}`}
          >
            Create or link portal user
          </Button>
        )}
        {!scope.create && (
          <Button disabled={busy} onClick={() => setRevision(v => v + 1)}>
            Refresh
          </Button>
        )}
      </Toolbar>
      <Box sx={managementContentStyles}>
        {message && (!requestedJob || message !== savedJobMessage) && (
          <Alert severity={severity}>{message}</Alert>
        )}
        {requestedJob && (
          <Alert
            severity={savedJob?.stage === 'complete' ? 'success' : 'warning'}
          >
            {savedJobMessage}
            {savedJob && !tenant && (
              <Button
                component={Link}
                to={`/management/tenants/${savedJob.tenant_id}?job=${encodeURIComponent(savedJob.id)}`}
              >
                View tenant provisioning
              </Button>
            )}
          </Alert>
        )}
        {!scope.portalUsers && !tenant && !enabledCells.length && (
          <Alert severity="info">
            No enabled cells are available. Register or enable a configured cell
            before creating a tenant.
            <Button component={Link} to="/management/cells">
              Go to Cells
            </Button>
          </Alert>
        )}
        {scope.create ? (
          scope.portalUsers ? (
            can('members') && (
              <Stack
                component="form"
                sx={managementFormStyles}
                spacing={2}
                onSubmit={e => void submit(e)}
              >
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
                  helperText="An employee can be designated as the initial tenant administrator during activation."
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
                  defaultValue={user?.email ?? ''}
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
              <Stack
                component="form"
                sx={managementFormStyles}
                spacing={2}
                onSubmit={e => void submit(e)}
              >
                <input type="hidden" name="operation" value="tenant" />
                <TextField name="code" label="Tenant code" required />
                <TextField name="name" label="Tenant name" required />
                <TextField
                  select
                  name="tier"
                  label="Tier"
                  defaultValue="starter"
                >
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
                <Button type="submit" disabled={busy || !enabledCells.length}>
                  Create pending tenant
                </Button>
              </Stack>
            )
          )
        ) : tenant ? (
          <>
            <Stack direction="row" spacing={1}>
              <Chip label={tenant.status} variant="outlined" />
              <Chip label={tenant.tier} variant="outlined" />
            </Stack>
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: 'wrap' }}
            >
              {can('provision') && jobs.length > 0 && (
                <Button
                  onClick={() => setAction(action === 'retry' ? '' : 'retry')}
                >
                  Retry provisioning
                </Button>
              )}
              {can('provision') && tenant.status === 'pending' && (
                <Button
                  onClick={() =>
                    setAction(action === 'activate' ? '' : 'activate')
                  }
                >
                  Activate tenant
                </Button>
              )}
              {can('access') &&
                tenant.status === 'active' &&
                employees.length > 0 && (
                  <Button
                    onClick={() =>
                      setAction(action === 'access' ? '' : 'access')
                    }
                  >
                    Inspect employee
                  </Button>
                )}
            </Stack>
            <Typography>
              Assigned cell:{' '}
              {assignedCell
                ? `${assignedCell.name} (${assignedCell.enabled ? 'enabled' : 'disabled'})`
                : 'Unavailable'}
            </Typography>
            {tenant.status === 'pending' && (
              <Alert severity={activationBlocked ? 'info' : 'success'}>
                {!assignedCell?.enabled
                  ? 'Enable the assigned cell before activation.'
                  : !members.length
                    ? 'Next: create or link the initial employee portal user.'
                    : pendingMembers
                      ? 'Next: retry incomplete provisioning before activation.'
                      : !employees.length
                        ? 'Next: provision an active employee for the initial administrator.'
                        : 'Ready for activation checks. Choose the initial tenant administrator and activate.'}
              </Alert>
            )}
            {tenant.status === 'active' && (
              <Alert severity="success">
                Tenant activated. The initial administrator can sign in at
                /login. New portal users must change their temporary password
                before entering the tenant. Linked users keep their existing
                credentials.
              </Alert>
            )}
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
            {action === 'retry' && can('provision') && jobs.length > 0 && (
              <Stack
                component="form"
                sx={managementFormStyles}
                spacing={2}
                onSubmit={e => void submit(e)}
              >
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
                  helperText="Enter the name if the original record could not be saved. An existing record can be retried without a name."
                />
                <Button type="submit" disabled={busy}>
                  Retry provisioning
                </Button>
              </Stack>
            )}
            {action === 'activate' &&
              can('provision') &&
              tenant.status === 'pending' && (
                <Stack
                  component="form"
                  sx={managementFormStyles}
                  spacing={2}
                  onSubmit={e => void submit(e)}
                >
                  <Typography component="h3" variant="h6">
                    Activate tenant
                  </Typography>
                  <input type="hidden" name="operation" value="activate" />
                  <input type="hidden" name="target" value={tenant.id} />
                  <TextField
                    select
                    name="administrator"
                    label="Initial administrator"
                    defaultValue={
                      employees.length === 1 ? employees[0]?.id : ''
                    }
                    required
                  >
                    {employees.map(m => (
                      <MenuItem key={m.id} value={m.id}>
                        {userName(m.portal_user_id)}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Typography>
                    Activation checks that the tenant and initial administrator
                    are ready.
                  </Typography>
                  <Button type="submit" disabled={busy || activationBlocked}>
                    Verify and activate
                  </Button>
                </Stack>
              )}
            {action === 'access' &&
              can('access') &&
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
        ) : user ? (
          <Stack spacing={2}>
            <Chip
              label={user.status}
              variant="outlined"
              sx={{ alignSelf: 'flex-start' }}
            />
            <Typography component="h2" variant="h6">
              Tenant memberships
            </Typography>
            {data.members
              .filter(m => m.portal_user_id === user.id)
              .map(m => (
                <Stack
                  key={m.id}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                >
                  <Button
                    component={Link}
                    to={`/management/tenants/${m.tenant_id}`}
                  >
                    {data.tenants.find(t => t.id === m.tenant_id)?.company ??
                      'Tenant unavailable'}
                  </Button>
                  <Typography>
                    {m.user_type} · {m.status} · {m.ready ? 'Ready' : 'Pending'}
                  </Typography>
                </Stack>
              ))}
            {!data.members.some(m => m.portal_user_id === user.id) && (
              <Typography>No tenant memberships.</Typography>
            )}
          </Stack>
        ) : (
          <Box sx={managementGridStyles}>
            <DataGrid
              aria-label={scope.portalUsers ? 'Portal users' : 'Tenants'}
              rows={filtered}
              columns={columns}
              disableRowSelectionOnClick
              disableColumnFilter
              paginationModel={{ page, pageSize: size }}
              pageSizeOptions={[size]}
              onPaginationModelChange={model => {
                if (model.page !== page)
                  changeView({ page: model.page ? String(model.page) : '' });
              }}
              sortModel={
                columns.some(
                  c => c.field === scope.sort && c.sortable !== false
                )
                  ? [
                      {
                        field: scope.sort,
                        sort: scope.descending ? 'desc' : 'asc',
                      },
                    ]
                  : []
              }
              onSortModelChange={model =>
                changeView({
                  sort: model[0]?.field ?? '',
                  direction: model[0]?.sort ?? '',
                  page: '',
                })
              }
              localeText={{
                noRowsLabel: rows.length
                  ? 'No matching records.'
                  : 'No records available.',
              }}
            />
            <Menu
              anchorEl={rowMenu?.anchor}
              open={!!rowMenu}
              onClose={() => setRowMenu(null)}
            >
              <MenuItem
                component={Link}
                to={
                  scope.portalUsers
                    ? `${listPath}?record=${rowMenu?.id}`
                    : `${listPath}/${rowMenu?.id}`
                }
                onClick={() => setRowMenu(null)}
              >
                {scope.portalUsers ? 'View memberships' : 'View tenant'}
              </MenuItem>
              {can('members') && (
                <MenuItem
                  component={Link}
                  to={`/management/portal-users/new?${scope.portalUsers ? 'record' : 'target'}=${rowMenu?.id}`}
                  onClick={() => setRowMenu(null)}
                >
                  {scope.portalUsers
                    ? 'Link to tenant'
                    : 'Create or link portal user'}
                </MenuItem>
              )}
            </Menu>
          </Box>
        )}
      </Box>
    </Box>
  );
}
