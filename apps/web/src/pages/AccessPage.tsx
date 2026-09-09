/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Container,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  accessOverviewSchema,
  accessChangeSchema,
  effectiveAccessSchema,
  scopeKinds,
} from '@nap/shared';
import type { z } from 'zod';
import { getAccess, saveAccess, getEffective } from '../api/access.js';
import { useSession } from '../auth/session.js';
import { SessionStatus } from '../auth/SessionStatus.js';
/** Does: Edits roles and scoped assignments and explains effective access. Called by: the tenant access route. */
export function AccessPage() {
  const { state } = useSession();
  return (
    <AccessEditor
      key={
        state.status === 'ready'
          ? `${state.session?.actorId}:${state.session?.tenantId}`
          : state.status
      }
    />
  );
}
/** Does: Holds tenant-local role form state. Called by: AccessPage with a tenant identity key. */
function AccessEditor() {
  const { state } = useSession();
  const tenant = state.status === 'ready' ? state.session?.tenantId : null;
  const [data, setData] =
    useState<z.infer<typeof accessOverviewSchema>['data']>();
  const [revision, setRevision] = useState(0);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [roleId, setRoleId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [fieldGrants, setFieldGrants] = useState<
    { resource: string; group: string; view: boolean; edit: boolean }[]
  >([]);
  const [binding, setBinding] = useState('');
  const [assignedRole, setAssignedRole] = useState('');
  const [scope, setScope] = useState<(typeof scopeKinds)[number]>('projects');
  const [targets, setTargets] = useState<string[]>([]);
  const [effective, setEffective] =
    useState<z.infer<typeof effectiveAccessSchema>['data']>();
  useEffect(() => {
    let active = true;
    void getAccess().then(r => {
      if (active) {
        setData(r.ok ? r.body.data : undefined);
        setMessage(r.ok ? '' : r.error.message);
      }
    });
    return () => {
      active = false;
    };
  }, [tenant, revision]);
  /** Does: Persists an access change and refreshes explanations. Called by: administration buttons. */
  async function save(body: unknown) {
    const parsed = accessChangeSchema.safeParse(body);
    if (!parsed.success) {
      setMessage('Check the role, person and scope selections.');
      return;
    }
    setBusy(true);
    const result = await saveAccess(parsed.data);
    setBusy(false);
    setMessage(result.ok ? 'Access saved.' : result.error.message);
    if (result.ok) {
      setEffective(undefined);
      setRevision(r => r + 1);
    }
  }
  /** Does: Loads a role into the editor. Called by: role selection. */
  function editRole(id: string) {
    const role = data?.roles.find(r => r.id === id);
    setRoleId(id);
    setCode(role?.code ?? '');
    setName(role?.name ?? '');
    setCapabilities(role?.capabilities ?? []);
    setFieldGrants(role?.fields ?? []);
  }
  if (state.status !== 'ready') return <SessionStatus />;
  if (!state.session) return <Navigate to="/login?next=%2Faccess" replace />;
  if (!tenant) return <Navigate to="/tenants" replace />;
  const permanent = data?.roles.find(r => r.id === roleId)?.permanent;
  const choices = scope === 'projects' ? data?.projects : data?.companies;
  return (
    <Container component="main" maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Typography variant="h4" component="h1">
          Roles and access
        </Typography>
        <Stack direction="row" spacing={2}>
          <Button component={Link} to="/account">
            Account
          </Button>
          <Button component={Link} to="/companies">
            Companies
          </Button>
          <Button component={Link} to="/projects">
            Projects
          </Button>
        </Stack>
        {state.session.controlledAccess && (
          <Alert severity="warning">
            Controlled access: {state.session.controlledAccess.reason}. Exit
            from Account.
          </Alert>
        )}
        {message && (
          <Alert severity={data ? 'info' : 'warning'}>{message}</Alert>
        )}
        {data && (
          <>
            <Typography component="h2" variant="h5">
              Role definitions
            </Typography>
            <TextField
              select
              label="Edit role"
              value={roleId}
              onChange={e => editRole(e.target.value)}
            >
              <MenuItem value="">New role</MenuItem>
              {data.roles.map(r => (
                <MenuItem key={r.id} value={r.id}>
                  {r.name}
                  {r.permanent ? ' (built-in)' : ''}
                </MenuItem>
              ))}
            </TextField>
            {permanent ? (
              <Alert severity="info">
                Built-in role identity and privileges cannot be edited.
              </Alert>
            ) : (
              <Box
                component="form"
                onSubmit={e => {
                  e.preventDefault();
                  void save({
                    operation: 'role',
                    ...(roleId ? { id: roleId } : {}),
                    code,
                    name,
                    capabilities,
                    fields: fieldGrants,
                  });
                }}
              >
                <Stack spacing={2}>
                  <TextField
                    label="Role code"
                    required
                    disabled={!!roleId}
                    value={code}
                    onChange={e => setCode(e.target.value)}
                  />
                  <TextField
                    label="Role name"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                  {data.catalog.map(r => (
                    <Box key={r.resource}>
                      <Typography>{r.label}</Typography>
                      {r.capabilities.map(c => (
                        <FormControlLabel
                          key={c}
                          label={c.split('::').at(-1)}
                          control={
                            <Checkbox
                              checked={capabilities.includes(c)}
                              onChange={(_, checked) =>
                                setCapabilities(old =>
                                  checked
                                    ? [...old, c]
                                    : old.filter(p => p !== c)
                                )
                              }
                            />
                          }
                        />
                      ))}
                      {r.fields.map(g => (
                        <Box key={g.name}>
                          <Typography>{g.name}</Typography>
                          {(['view', 'edit'] as const).map(mode => (
                            <FormControlLabel
                              key={mode}
                              label={mode}
                              control={
                                <Checkbox
                                  checked={fieldGrants.some(
                                    f =>
                                      f.resource === r.resource &&
                                      f.group === g.name &&
                                      f[mode]
                                  )}
                                  onChange={(_, checked) =>
                                    setFieldGrants(old => {
                                      const field = old.find(
                                        f =>
                                          f.resource === r.resource &&
                                          f.group === g.name
                                      ) ?? {
                                        resource: r.resource,
                                        group: g.name,
                                        view: false,
                                        edit: false,
                                      };
                                      return [
                                        ...old.filter(
                                          f =>
                                            f !== field &&
                                            !(
                                              f.resource === r.resource &&
                                              f.group === g.name
                                            )
                                        ),
                                        { ...field, [mode]: checked },
                                      ];
                                    })
                                  }
                                />
                              }
                            />
                          ))}
                        </Box>
                      ))}
                    </Box>
                  ))}
                  <Button type="submit" variant="contained" disabled={busy}>
                    Save role
                  </Button>
                  {roleId && (
                    <Button
                      color="error"
                      disabled={busy}
                      onClick={() =>
                        void save({ operation: 'archive-role', id: roleId })
                      }
                    >
                      Archive role
                    </Button>
                  )}
                </Stack>
              </Box>
            )}
            <Typography component="h2" variant="h5">
              Assign a role
            </Typography>
            <TextField
              select
              label="Person"
              value={binding}
              onChange={e => {
                setBinding(e.target.value);
                setEffective(undefined);
              }}
            >
              <MenuItem value="">Select person</MenuItem>
              {data.users.map(u => (
                <MenuItem key={u.id} value={u.id}>
                  {u.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Assigned role"
              value={assignedRole}
              onChange={e => setAssignedRole(e.target.value)}
            >
              <MenuItem value="">Select role</MenuItem>
              {data.roles.map(r => (
                <MenuItem key={r.id} value={r.id}>
                  {r.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Scope"
              value={scope}
              onChange={e => {
                setScope(e.target.value as typeof scope);
                setTargets([]);
              }}
            >
              {scopeKinds.map(s => (
                <MenuItem key={s} value={s}>
                  {
                    {
                      self: 'Self',
                      companies: 'Selected companies',
                      projects: 'Selected projects',
                      all_companies: 'All companies',
                      all_projects: 'All projects',
                      company_projects:
                        'All projects within selected companies',
                      tenant: 'Entire tenant',
                    }[s]
                  }
                </MenuItem>
              ))}
            </TextField>
            <Alert severity="info">
              All includes existing and future records. Each assignment adds
              only its role's privileges within its scope.
            </Alert>
            {['companies', 'company_projects', 'projects'].includes(scope) && (
              <Box>
                {choices?.map(c => (
                  <FormControlLabel
                    key={c.id}
                    label={`${c.code} — ${c.name}`}
                    control={
                      <Checkbox
                        checked={targets.includes(c.id)}
                        onChange={(_, checked) =>
                          setTargets(old =>
                            checked
                              ? [...old, c.id]
                              : old.filter(id => id !== c.id)
                          )
                        }
                      />
                    }
                  />
                ))}
              </Box>
            )}
            <Button
              variant="contained"
              disabled={busy || !binding || !assignedRole}
              onClick={() =>
                void save({
                  operation: 'assign',
                  bindingId: binding,
                  roleId: assignedRole,
                  scope,
                  targets,
                })
              }
            >
              Assign role
            </Button>
            <Typography component="h2" variant="h5">
              Effective access
            </Typography>
            <Button
              disabled={!binding || busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  const result = await getEffective(binding);
                  setBusy(false);
                  if (result.ok) setEffective(result.body.data);
                  else setMessage(result.error.message);
                })();
              }}
            >
              Explain selected person's access
            </Button>
            {effective?.length === 0 && (
              <Typography>
                No business roles assigned. Only baseline profile access
                remains.
              </Typography>
            )}
            {effective?.map(a => (
              <Box key={a.id} sx={{ border: 1, borderColor: 'divider', p: 2 }}>
                <Typography variant="h6">{a.role.name}</Typography>
                <Typography>
                  Scope: {a.scope.replaceAll('_', ' ')}{' '}
                  {a.targets
                    .map(
                      id =>
                        [...data.companies, ...data.projects].find(
                          r => r.id === id
                        )?.name ?? id
                    )
                    .join(', ')}
                </Typography>
                <Typography>
                  {a.role.code === 'tenant_admin'
                    ? 'All tenant capabilities and fields'
                    : a.role.capabilities
                        .map(c => c.replaceAll('::', ' / '))
                        .join(', ')}
                </Typography>
                <Typography>
                  Field grants:{' '}
                  {a.role.code === 'tenant_admin'
                    ? 'All fields in enabled modules'
                    : a.role.fields
                        .map(
                          f =>
                            `${f.group}: ${f.view ? 'view ' : ''}${f.edit ? 'edit' : ''}`
                        )
                        .join(', ') || 'None'}
                </Typography>
                <Button
                  disabled={busy}
                  color="error"
                  onClick={() => void save({ operation: 'revoke', id: a.id })}
                >
                  Revoke this assignment
                </Button>
              </Box>
            ))}
            {effective && (
              <Alert severity="info">
                Other listed assignments continue to grant their access when one
                assignment is revoked. Module entitlements and mandatory
                workflow rules still apply to every assignment.
              </Alert>
            )}
          </>
        )}
      </Stack>
    </Container>
  );
}
