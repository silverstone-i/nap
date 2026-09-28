/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import {
  archiveRole,
  getRole,
  listRoles,
  restoreRole,
} from '../../api/endpoints.js';
import { useSession } from '../../auth/SessionContext.jsx';
import { useCapabilities } from '../../auth/useCapabilities.js';
import { ConfirmDialog } from '../../grid/ConfirmDialog.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { RoleBadges } from './RoleBadges.jsx';
import { RoleDetailDialog } from './RoleDetailDialog.jsx';
import { RoleFormDialog } from './RoleFormDialog.jsx';
import { UserRolesSection } from './UserRolesSection.jsx';
import { describeRoleError, isStaleRevision } from './roleErrors.js';

/**
 * `/management/roles` (M0003-R016): the selected tenant's roles, their
 * detail, create / edit / archive / restore, and a user's assignments.
 * Every call is scoped server-side to the session's selected tenant.
 */
export function RolesPage() {
  const session = useSession();
  const tenant = session.selectedTenant;
  const [includeArchived, setIncludeArchived] = useState(false);
  const [roles, setRoles] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const { can, onError } = useCapabilities();
  const canWrite = can('access-control::roles::write');

  usePageHeader({
    title: 'Roles',
    actions:
      tenant && canWrite ? (
        <Button
          variant="contained"
          size="small"
          onClick={() => setForm({ role: null })}
        >
          Create role
        </Button>
      ) : null,
  });

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(key => key + 1);

  useEffect(() => {
    if (!tenant) return undefined;
    let cancelled = false;
    listRoles({ includeArchived })
      .then(rows => {
        if (cancelled) return;
        setLoadError(null);
        setRoles(rows);
      })
      .catch(err => {
        if (!cancelled) setLoadError(describeRoleError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [tenant, includeArchived, reloadKey]);

  async function runLifecycle(action) {
    setActionError(null);
    try {
      setSelected(await action(selected.id, selected.revision));
      reload();
    } catch (err) {
      onError(err);
      setActionError(describeRoleError(err));
      if (isStaleRevision(err)) {
        try {
          setSelected(await getRole(selected.id));
        } catch {
          // Keep the stale view; the list reload below still refreshes.
        }
        reload();
      }
    }
  }

  if (!tenant)
    return <Alert severity="info">Select a tenant to manage its roles.</Alert>;

  return (
    <Stack spacing={3}>
      {actionError ? (
        <Alert severity="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}
      <FormControlLabel
        control={
          <Switch
            checked={includeArchived}
            onChange={event => setIncludeArchived(event.target.checked)}
          />
        }
        label="Include archived"
      />
      {loadError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={reload}>
              Retry
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : roles === null ? (
        <CircularProgress aria-label="Loading roles" />
      ) : roles.length === 0 ? (
        <Typography color="text.secondary">No roles yet.</Typography>
      ) : (
        <Table size="small" aria-label="Roles">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Code</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Grants</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {roles.map(role => (
              <TableRow key={role.id} hover>
                <TableCell>
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => setSelected(role)}
                  >
                    {role.name}
                  </Button>
                </TableCell>
                <TableCell>{role.code}</TableCell>
                <TableCell>
                  <RoleBadges role={role} />
                </TableCell>
                <TableCell>{role.grants.length}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <UserRolesSection roles={roles ?? []} />
      {selected && !form ? (
        <RoleDetailDialog
          role={selected}
          canWrite={canWrite}
          onClose={() => setSelected(null)}
          onEdit={() => setForm({ role: selected })}
          onArchive={() => setConfirmArchive(true)}
          onRestore={() => runLifecycle(restoreRole)}
        />
      ) : null}
      <ConfirmDialog
        open={confirmArchive}
        title="Archive role?"
        description="An archived role grants nothing until it is restored. Its grants and assignments are kept."
        confirmLabel="Archive"
        onConfirm={() => {
          setConfirmArchive(false);
          runLifecycle(archiveRole);
        }}
        onCancel={() => setConfirmArchive(false)}
      />
      {form ? (
        <RoleFormDialog
          role={form.role}
          tenantCode={tenant.code}
          onClose={() => setForm(null)}
          onSaved={saved => {
            setForm(null);
            setSelected(saved);
            reload();
          }}
        />
      ) : null}
    </Stack>
  );
}
