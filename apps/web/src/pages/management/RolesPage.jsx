/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import ArchiveIcon from '@mui/icons-material/Archive';
import EditIcon from '@mui/icons-material/Edit';
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash';
import { ApiError } from '../../api/client.js';
import {
  archiveRole,
  bulkRoleAction,
  getRole,
  listRoles,
  restoreRole,
} from '../../api/endpoints.js';
import { useSession } from '../../auth/SessionContext.jsx';
import { useCapabilities } from '../../auth/useCapabilities.js';
import { ConfirmDialog } from '../../grid/ConfirmDialog.jsx';
import { createListPageAdapter } from '../../grid/listPageAdapter.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import {
  ALREADY_IN_STATE,
  useBulkArchive,
} from '../../grid/useBulkArchive.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { useDebouncedValue } from '../../shell/useDebouncedValue.js';
import { RoleBadges } from './RoleBadges.jsx';
import { RoleDetailDialog } from './RoleDetailDialog.jsx';
import { RoleFormDialog } from './RoleFormDialog.jsx';
import { UserRolesSection } from './UserRolesSection.jsx';
import { describeRoleError, isStaleRevision } from './roleErrors.js';

const ARCHIVE_TEXT =
  'An archived role grants nothing until it is restored. Its grants and assignments are kept.';

/**
 * The role grid's columns. Selecting a role's name opens its detail
 * (I0001-R031).
 * @param {(role: object) => void} onOpen
 * @returns {object[]}
 */
function columnsFor(onOpen) {
  const plain = { sortable: false, filterable: false };
  return [
    {
      ...plain,
      field: 'name',
      headerName: 'Name',
      flex: 2,
      priority: 'essential',
      renderCell: ({ row }) => (
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', height: '100%' }}
        >
          <Button variant="text" size="small" onClick={() => onOpen(row)}>
            {row.name}
          </Button>
          {row.archived ? <Chip size="small" label="Archived" /> : null}
        </Stack>
      ),
    },
    {
      ...plain,
      field: 'code',
      headerName: 'Code',
      flex: 1,
      priority: 'secondary',
    },
    {
      ...plain,
      field: 'isImmutable',
      headerName: 'Type',
      flex: 1,
      priority: 'secondary',
      renderCell: ({ row }) => (
        <Stack direction="row" sx={{ alignItems: 'center', height: '100%' }}>
          <RoleBadges role={row} showArchived={false} />
        </Stack>
      ),
    },
    {
      ...plain,
      field: 'grants',
      headerName: 'Grants',
      width: 90,
      priority: 'secondary',
      valueGetter: grants => grants.length,
    },
  ];
}

/**
 * `/settings/roles` (M0003-R016–R018): the selected tenant's roles in a
 * standard grid, their detail, create / edit / archive / restore one or a
 * page of them, and a user's assignments below. The header holds the name
 * search, the filter popover (Include archived), the bulk actions, and
 * Create role. Every call is scoped server-side to the session's selected
 * tenant.
 */
export function RolesPage() {
  const session = useSession();
  const tenant = session.selectedTenant;
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [roles, setRoles] = useState([]);
  const [actionError, setActionError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const { can, onError } = useCapabilities();
  const canWrite = can('access-control::roles::write');
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(key => key + 1);

  const needle = useDebouncedValue(search.trim().toLowerCase());
  const fetchPage = useMemo(
    () =>
      createListPageAdapter(
        async () => {
          const rows = await listRoles({ includeArchived });
          // The full list also feeds the user roles section below.
          setRoles(rows);
          return rows;
        },
        role =>
          role.name.toLowerCase().includes(needle) ||
          role.code.toLowerCase().includes(needle)
      ),
    [includeArchived, needle]
  );
  const resetKey = `${tenant?.id}:${includeArchived}:${needle}:${reloadKey}`;

  const bulk = useBulkArchive({
    canWrite,
    noun: ['role', 'roles'],
    nameOf: role => role.name,
    run: bulkRoleAction,
    describeError: describeRoleError,
    describeItem: (code, action) =>
      code === 'INVALID_STATE'
        ? ALREADY_IN_STATE[action]
        : describeRoleError(new ApiError(code, 409)),
    archiveText: ARCHIVE_TEXT,
    onDone: reload,
    onError,
  });

  /** Run a lifecycle action on `role`, then reload or report the failure. */
  async function runLifecycle(action, role) {
    setActionError(null);
    try {
      const saved = await action(role.id, role.revision);
      if (selected) setSelected(saved);
      reload();
    } catch (err) {
      onError(err);
      setActionError(describeRoleError(err));
      if (isStaleRevision(err)) {
        if (selected) {
          try {
            setSelected(await getRole(role.id));
          } catch {
            // Keep the stale view; the list reload below still refreshes.
          }
        }
        reload();
      }
    }
  }

  function rowActions(role) {
    if (!canWrite || role.isImmutable) return [];
    return role.archived
      ? [
          {
            label: 'Restore',
            icon: <RestoreFromTrashIcon fontSize="small" />,
            onClick: target => runLifecycle(restoreRole, target),
          },
        ]
      : [
          {
            label: 'Edit',
            icon: <EditIcon fontSize="small" />,
            onClick: target => setForm({ role: target }),
          },
          {
            label: 'Archive',
            icon: <ArchiveIcon fontSize="small" />,
            destructive: true,
            confirmDescription: ARCHIVE_TEXT,
            onClick: target => runLifecycle(archiveRole, target),
          },
        ];
  }

  usePageHeader({
    title: 'Roles',
    search: tenant
      ? {
          value: search,
          onChange: setSearch,
          placeholder: 'Search roles',
          label: 'Search roles',
        }
      : null,
    filters: tenant
      ? {
          content: (
            <FormControlLabel
              control={
                <Switch
                  checked={includeArchived}
                  onChange={event => setIncludeArchived(event.target.checked)}
                />
              }
              label="Include archived"
            />
          ),
          chips: includeArchived
            ? [
                {
                  key: 'archived',
                  label: 'Including archived',
                  onDelete: () => setIncludeArchived(false),
                },
              ]
            : [],
        }
      : null,
    actions: tenant
      ? [
          ...bulk.actions,
          canWrite && {
            label: 'Create role',
            create: true,
            onClick: () => setForm({ role: null }),
          },
        ]
      : null,
  });

  if (!tenant)
    return <Alert severity="info">Select a tenant to manage its roles.</Alert>;

  return (
    <Stack spacing={3}>
      {actionError ? (
        <Alert severity="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}
      <StandardDataGrid
        columns={columnsFor(setSelected)}
        fetchPage={fetchPage}
        resetKey={resetKey}
        rowActions={rowActions}
        onSelectionChange={bulk.onSelectionChange}
        selectable={canWrite}
        ariaLabel="Roles"
        emptyMessage="No roles match."
        describeError={describeRoleError}
      />
      {bulk.dialogs}
      <UserRolesSection roles={roles} />
      {selected && !form ? (
        <RoleDetailDialog
          role={selected}
          canWrite={canWrite}
          onClose={() => setSelected(null)}
          onEdit={() => setForm({ role: selected })}
          onArchive={() => setConfirmArchive(true)}
          onRestore={() => runLifecycle(restoreRole, selected)}
        />
      ) : null}
      <ConfirmDialog
        open={confirmArchive}
        title="Archive role?"
        description={ARCHIVE_TEXT}
        confirmLabel="Archive"
        onConfirm={() => {
          setConfirmArchive(false);
          runLifecycle(archiveRole, selected);
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
