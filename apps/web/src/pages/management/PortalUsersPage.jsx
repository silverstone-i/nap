/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ArchiveIcon from '@mui/icons-material/Archive';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import GroupsIcon from '@mui/icons-material/Groups';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import LockResetIcon from '@mui/icons-material/LockReset';
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash';
import { ApiError } from '../../api/client.js';
import { denialMessage } from '../../auth/capabilities.js';
import { useCapabilities } from '../../auth/useCapabilities.js';
import {
  bulkPortalUserAction,
  deactivatePortalUser,
  listTenantsPage,
  listUsersPage,
  restorePortalUser,
  setUserStatus,
  unlockUser,
} from '../../api/endpoints.js';
import { createCursorPageAdapter } from '../../grid/cursorPageAdapter.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import { useBulkArchive } from '../../grid/useBulkArchive.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { useDebouncedValue } from '../../shell/useDebouncedValue.js';
import { CreatePortalUserDialog } from './CreatePortalUserDialog.jsx';
import {
  MembershipsDialog,
  ResetPasswordDialog,
} from './LoginRecoveryDialogs.jsx';

const COLUMNS = [
  {
    field: 'email',
    headerName: 'Email',
    flex: 2,
    sortable: false,
    filterable: false,
    priority: 'essential',
    // I0001-R030: a deactivated user, shown only with Include archived.
    renderCell: ({ row }) => (
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', height: '100%' }}
      >
        <span>{row.email}</span>
        {row.deactivatedAt ? <Chip size="small" label="Archived" /> : null}
      </Stack>
    ),
  },
  {
    field: 'status',
    headerName: 'Status',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'essential',
  },
  {
    field: 'mustChangePassword',
    headerName: 'Must change password',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'essential',
    type: 'boolean',
  },
  {
    field: 'deactivatedAt',
    headerName: 'Deactivated',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'secondary',
    type: 'dateTime',
  },
];

const DEACTIVATE_TEXT =
  'Deactivated users are signed out and cannot sign in until restored.';

/** I0002-R013: a bulk item's `INVALID_STATE` is the state it is already in. */
const ALREADY = {
  archive: 'It is already deactivated.',
  restore: 'It is not deactivated.',
};

/** Filter choices (I0002-R016); `''` means no filter. */
const STATUS_LABELS = { active: 'Active', disabled: 'Disabled' };
const MUST_CHANGE_LABELS = { true: 'Yes', false: 'No' };
const NO_FILTERS = { tenantId: '', status: '', mustChangePassword: '' };

function describeActionError(err) {
  if (err instanceof ApiError && err.code === 'ADMIN_ASSIGNED')
    return 'Remove this user’s administrator roles before deactivating the account.';
  if (err instanceof ApiError && err.code === 'ROOT_IMMUTABLE')
    return 'The initial Napsoft user cannot be changed.';
  if (err instanceof ApiError && err.code === 'INVALID_STATE')
    return 'This account cannot perform that action right now.';
  if (err instanceof ApiError && err.code === 'FORBIDDEN')
    return denialMessage(err);
  if (err instanceof ApiError && err.code === 'NOT_FOUND')
    return 'This account no longer exists.';
  if (err instanceof ApiError && err.code === 'INVALID_INPUT')
    return 'Enter a temporary password of 1 to 128 characters.';
  return 'Something went wrong. Please try again.';
}

/**
 * `/management/portal-users` (I0002-R005/R006, R012–R016): browse
 * portal-user accounts, searching by email (R015) and filtering by tenant,
 * status, and must-change-password (R016); create one; deactivate
 * or restore one or a page of them. Deactivated accounts show only with Include archived, in the
 * header's filter popover. Napsoft login recovery (I0008-R013–R016): view
 * memberships, reset the password, unlock, and disable or re-enable a
 * login.
 */
export function PortalUsersPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [search, setSearch] = useState('');
  const email = useDebouncedValue(search.trim());
  const fetchPage = useMemo(
    () =>
      createCursorPageAdapter(page =>
        listUsersPage({
          ...page,
          includeArchived,
          email: email || undefined,
          tenantId: filters.tenantId || undefined,
          status: filters.status || undefined,
          mustChangePassword: filters.mustChangePassword || undefined,
        })
      ),
    [includeArchived, email, filters]
  );
  const [reloadTick, setReloadTick] = useState(0);
  const resetKey = `${includeArchived}:${email}:${JSON.stringify(filters)}:${reloadTick}`;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionError, setActionError] = useState(null);
  const { can, onError } = useCapabilities();
  const canRead = can('admin-tenancy::accounts::read', 'napsoft');
  const canWrite = can('admin-tenancy::accounts::write', 'napsoft');
  const canListTenants = can('admin-tenancy::control::read', 'napsoft');
  const [tenants, setTenants] = useState([]);
  const [membershipsOf, setMembershipsOf] = useState(null);

  useEffect(() => {
    if (!canListTenants) return undefined;
    let live = true;
    listTenantsPage({ limit: 100 })
      .then(page => live && setTenants(page.rows))
      .catch(() => live && setTenants([]));
    return () => {
      live = false;
    };
  }, [canListTenants]);

  const setFilter = key => event =>
    setFilters(prev => ({ ...prev, [key]: event.target.value }));
  const clearFilter = key => () => setFilters(prev => ({ ...prev, [key]: '' }));
  const chips = [
    filters.tenantId && {
      key: 'tenant',
      label: `Tenant: ${
        tenants.find(tenant => tenant.id === filters.tenantId)?.code ??
        'selected'
      }`,
      onDelete: clearFilter('tenantId'),
    },
    filters.status && {
      key: 'status',
      label: `Status: ${STATUS_LABELS[filters.status]}`,
      onDelete: clearFilter('status'),
    },
    filters.mustChangePassword && {
      key: 'mustChange',
      label: `Must change password: ${MUST_CHANGE_LABELS[filters.mustChangePassword]}`,
      onDelete: clearFilter('mustChangePassword'),
    },
    includeArchived && {
      key: 'archived',
      label: 'Including archived',
      onDelete: () => setIncludeArchived(false),
    },
  ].filter(Boolean);
  const [resetting, setResetting] = useState(null);

  const bulk = useBulkArchive({
    canWrite,
    noun: ['user', 'users'],
    nameOf: row => row.email,
    isArchived: row => Boolean(row.deactivatedAt),
    verbs: { archive: ['Deactivate', 'deactivated'] },
    run: (action, items) =>
      bulkPortalUserAction(
        action,
        items.map(item => item.id)
      ),
    describeError: describeActionError,
    describeItem: (code, action) =>
      code === 'INVALID_STATE'
        ? ALREADY[action]
        : describeActionError(new ApiError(code, 409)),
    archiveText: DEACTIVATE_TEXT,
    onDone: () => setReloadTick(tick => tick + 1),
    onError,
  });

  /** Run a row action, then reload the grid or report its failure. */
  async function act(action) {
    setActionError(null);
    try {
      await action();
      setReloadTick(tick => tick + 1);
    } catch (err) {
      onError(err);
      setActionError(describeActionError(err));
    }
  }

  usePageHeader({
    title: 'Portal Users',
    search: {
      value: search,
      onChange: setSearch,
      placeholder: 'Search by email',
      label: 'Search by email',
    },
    filters: {
      content: (
        <>
          {canListTenants ? (
            <TextField
              select
              size="small"
              label="Tenant"
              value={filters.tenantId}
              onChange={setFilter('tenantId')}
            >
              <MenuItem value="">All tenants</MenuItem>
              {tenants.map(tenant => (
                <MenuItem key={tenant.id} value={tenant.id}>
                  {tenant.code} — {tenant.name}
                </MenuItem>
              ))}
            </TextField>
          ) : null}
          <TextField
            select
            size="small"
            label="Status"
            value={filters.status}
            onChange={setFilter('status')}
          >
            <MenuItem value="">All</MenuItem>
            {Object.entries(STATUS_LABELS).map(([value, text]) => (
              <MenuItem key={value} value={value}>
                {text}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Must change password"
            value={filters.mustChangePassword}
            onChange={setFilter('mustChangePassword')}
          >
            <MenuItem value="">Any</MenuItem>
            {Object.entries(MUST_CHANGE_LABELS).map(([value, text]) => (
              <MenuItem key={value} value={value}>
                {text}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={
              <Switch
                checked={includeArchived}
                onChange={event => setIncludeArchived(event.target.checked)}
              />
            }
            label="Include archived"
          />
        </>
      ),
      chips,
    },
    actions: [
      ...bulk.actions,
      canWrite && {
        label: 'Create portal user',
        create: true,
        onClick: () => setDialogOpen(true),
      },
    ],
  });

  async function handleDeactivate(row) {
    setActionError(null);
    try {
      await deactivatePortalUser(row.id);
      setReloadTick(tick => tick + 1);
    } catch (err) {
      onError(err);
      setActionError(describeActionError(err));
    }
  }

  async function handleRestore(row) {
    setActionError(null);
    try {
      await restorePortalUser(row.id);
      setReloadTick(tick => tick + 1);
    } catch (err) {
      onError(err);
      setActionError(describeActionError(err));
    }
  }

  // Mutually exclusive by construction: an archived account can only be
  // restored, an active one only deactivated (I0002-R006).
  function rowActions(row) {
    const actions = [];
    if (canRead)
      actions.push({
        label: 'Memberships',
        icon: <GroupsIcon fontSize="small" />,
        onClick: setMembershipsOf,
      });
    if (!canWrite) return actions;
    if (row.deactivatedAt)
      return [
        ...actions,
        {
          label: 'Restore',
          icon: <RestoreFromTrashIcon fontSize="small" />,
          onClick: handleRestore,
        },
      ];
    return [
      ...actions,
      {
        label: 'Reset password',
        icon: <LockResetIcon fontSize="small" />,
        onClick: setResetting,
      },
      {
        label: 'Unlock',
        icon: <LockOpenIcon fontSize="small" />,
        onClick: target => act(() => unlockUser(target.id)),
      },
      row.status === 'disabled'
        ? {
            label: 'Enable',
            icon: <CheckCircleIcon fontSize="small" />,
            onClick: target => act(() => setUserStatus(target.id, 'active')),
          }
        : {
            label: 'Disable',
            icon: <BlockIcon fontSize="small" />,
            onClick: target => act(() => setUserStatus(target.id, 'disabled')),
          },
      {
        label: 'Deactivate',
        icon: <ArchiveIcon fontSize="small" />,
        destructive: true,
        confirmDescription: DEACTIVATE_TEXT,
        onClick: handleDeactivate,
      },
    ];
  }

  return (
    <>
      {actionError ? (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setActionError(null)}
        >
          {actionError}
        </Alert>
      ) : null}
      <StandardDataGrid
        columns={COLUMNS}
        fetchPage={fetchPage}
        resetKey={resetKey}
        rowActions={rowActions}
        onSelectionChange={bulk.onSelectionChange}
        selectable={canWrite}
        emptyMessage="No portal users yet."
      />
      {bulk.dialogs}
      {membershipsOf ? (
        <MembershipsDialog
          user={membershipsOf}
          describeError={describeActionError}
          onClose={() => setMembershipsOf(null)}
        />
      ) : null}
      {resetting ? (
        <ResetPasswordDialog
          user={resetting}
          describeError={describeActionError}
          onClose={() => setResetting(null)}
          onReset={() => {
            setResetting(null);
            setReloadTick(tick => tick + 1);
          }}
        />
      ) : null}
      {dialogOpen ? (
        <CreatePortalUserDialog
          onClose={() => setDialogOpen(false)}
          onCreated={() => {
            setDialogOpen(false);
            setReloadTick(tick => tick + 1);
          }}
        />
      ) : null}
    </>
  );
}
