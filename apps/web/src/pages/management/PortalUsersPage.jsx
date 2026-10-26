/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import ArchiveIcon from '@mui/icons-material/Archive';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
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
import { ArchiveViewTabs } from '../../grid/ArchiveViewTabs.jsx';
import { createCursorPageAdapter } from '../../grid/cursorPageAdapter.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import { useArchiveView } from '../../grid/useArchiveView.js';
import {
  ALREADY_IN_STATE,
  useBulkArchive,
} from '../../grid/useBulkArchive.jsx';
import { useNotice } from '../../shell/NoticeContext.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { useDebouncedValue } from '../../shell/useDebouncedValue.js';
import { CreatePortalUserDialog } from './CreatePortalUserDialog.jsx';
import { ResetPasswordDialog } from './LoginRecoveryDialogs.jsx';
import { PortalUserDetailDialog } from './PortalUserDetailDialog.jsx';

/**
 * The grid's columns (I0002-R017). Selecting an email opens the user's
 * detail, which holds the password, lock, archived date, and memberships.
 * @param {(row: object) => void} onOpen
 * @returns {object[]}
 */
function columnsFor(onOpen) {
  const plain = { sortable: false, filterable: false };
  return [
    {
      ...plain,
      field: 'email',
      headerName: 'Email',
      flex: 2,
      priority: 'essential',
      renderCell: ({ row }) => (
        <Button variant="text" size="small" onClick={() => onOpen(row)}>
          {row.email}
        </Button>
      ),
    },
    {
      ...plain,
      field: 'status',
      headerName: 'Status',
      flex: 1,
      priority: 'essential',
    },
    {
      ...plain,
      field: 'tenantCodes',
      headerName: 'Tenants',
      flex: 2,
      priority: 'secondary',
      valueGetter: codes => (codes?.length ? codes.join(', ') : '—'),
    },
  ];
}

/** I0002-R019: what Archive and Disable say before they run. */
const ARCHIVE_TEXT = 'Archived records move to the Archived tab.';
const DISABLE_TEXT = 'They are signed out and cannot sign in until enabled.';

/** Filter choices (I0002-R016); `''` means no filter. */
const STATUS_LABELS = { active: 'Active', disabled: 'Disabled' };
const MUST_CHANGE_LABELS = { true: 'Yes', false: 'No' };
const NO_FILTERS = { tenantId: '', status: '', mustChangePassword: '' };

function describeActionError(err) {
  if (err instanceof ApiError && err.code === 'ADMIN_ASSIGNED')
    return 'Remove this user’s administrator roles first.';
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
 * status, and must-change-password (R016); create one; archive
 * or restore one or a page of them (R019). Active and Archived tabs switch
 * between active and archived accounts, kept in the URL (I0011-R001–R005).
 * Selecting an email opens the user's detail (R018), which holds the
 * memberships and Napsoft login recovery (I0008-R013–R016, R019, R020):
 * reset the password, unlock a locked login, and disable or enable it.
 */
export function PortalUsersPage() {
  const [archived, setArchived] = useArchiveView();
  const [filters, setFilters] = useState(NO_FILTERS);
  const [search, setSearch] = useState('');
  const email = useDebouncedValue(search.trim());
  const fetchPage = useMemo(
    () =>
      createCursorPageAdapter(page =>
        listUsersPage({
          ...page,
          archived,
          email: email || undefined,
          tenantId: filters.tenantId || undefined,
          status: filters.status || undefined,
          mustChangePassword: filters.mustChangePassword || undefined,
        })
      ),
    [archived, email, filters]
  );
  const [reloadTick, setReloadTick] = useState(0);
  // I0011-R006: a view switch clears the selection and returns to page one.
  const resetKey = `${archived}:${email}:${JSON.stringify(filters)}:${reloadTick}`;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionError, setActionError] = useState(null);
  const { can, onError } = useCapabilities();
  const canWrite = can('admin-tenancy::accounts::write', 'napsoft');
  const canListTenants = can('admin-tenancy::control::read', 'napsoft');
  const [tenants, setTenants] = useState([]);
  const [selected, setSelected] = useState(null);
  const notify = useNotice();

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
  ].filter(Boolean);
  const [resetting, setResetting] = useState(null);

  const bulk = useBulkArchive({
    canWrite,
    noun: ['user', 'users'],
    nameOf: row => row.email,
    archived,
    run: (action, items) =>
      bulkPortalUserAction(
        action,
        items.map(item => item.id)
      ),
    describeError: describeActionError,
    describeItem: (code, action) =>
      code === 'INVALID_STATE'
        ? ALREADY_IN_STATE[action]
        : describeActionError(new ApiError(code, 409)),
    archiveText: ARCHIVE_TEXT,
    onDone: () => setReloadTick(tick => tick + 1),
    onError,
  });

  /**
   * Run a user action, then report it as a notice (I0002-R020), close the
   * detail, and reload the grid, or report its failure.
   */
  async function act(action, done) {
    setActionError(null);
    try {
      await action();
      notify(done);
      setSelected(null);
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
        </>
      ),
      chips,
    },
    tabs: <ArchiveViewTabs archived={archived} onChange={setArchived} />,
    actions: [
      ...bulk.actions,
      canWrite &&
        !archived && {
          label: 'New portal user',
          create: true,
          onClick: () => setDialogOpen(true),
        },
    ],
  });

  /**
   * The actions that apply to a user, for its row menu and its detail
   * (I0002-R018). An archived account can only be restored (I0002-R006).
   * @param {object} row
   * @returns {object[]}
   */
  function actionsFor(row) {
    if (!canWrite) return [];
    if (row.deactivatedAt)
      return [
        {
          label: 'Restore',
          icon: <RestoreFromTrashIcon fontSize="small" />,
          onClick: target =>
            act(
              () => restorePortalUser(target.id),
              `${target.email} restored.`
            ),
        },
      ];
    return [
      {
        label: 'Reset password',
        icon: <LockResetIcon fontSize="small" />,
        onClick: setResetting,
      },
      // I0008-R020: Unlock only while the login is locked.
      row.locked && {
        label: 'Unlock',
        icon: <LockOpenIcon fontSize="small" />,
        onClick: target =>
          act(() => unlockUser(target.id), `${target.email} unlocked.`),
      },
      row.status === 'disabled'
        ? {
            label: 'Enable',
            icon: <CheckCircleIcon fontSize="small" />,
            onClick: target =>
              act(
                () => setUserStatus(target.id, 'active'),
                `${target.email} enabled.`
              ),
          }
        : {
            label: 'Disable',
            icon: <BlockIcon fontSize="small" />,
            destructive: true,
            confirmTitle: 'Disable portal user?',
            confirmDescription: DISABLE_TEXT,
            onClick: target =>
              act(
                () => setUserStatus(target.id, 'disabled'),
                `${target.email} disabled.`
              ),
          },
      {
        label: 'Archive',
        icon: <ArchiveIcon fontSize="small" />,
        destructive: true,
        confirmTitle: 'Archive portal user?',
        confirmDescription: ARCHIVE_TEXT,
        onClick: target =>
          act(
            () => deactivatePortalUser(target.id),
            `${target.email} archived.`
          ),
      },
    ].filter(Boolean);
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
        columns={columnsFor(setSelected)}
        fetchPage={fetchPage}
        resetKey={resetKey}
        rowActions={actionsFor}
        onSelectionChange={bulk.onSelectionChange}
        selectable={canWrite}
        emptyMessage="No portal users yet."
      />
      {bulk.dialogs}
      {selected ? (
        <PortalUserDetailDialog
          user={selected}
          actions={actionsFor(selected).map(action => ({
            ...action,
            onClick: () => action.onClick(selected),
          }))}
          describeError={describeActionError}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {resetting ? (
        <ResetPasswordDialog
          user={resetting}
          describeError={describeActionError}
          onClose={() => setResetting(null)}
          onReset={() => {
            notify(`Password reset for ${resetting.email}.`);
            setResetting(null);
            setSelected(null);
            setReloadTick(tick => tick + 1);
          }}
        />
      ) : null}
      {dialogOpen ? (
        <CreatePortalUserDialog
          onClose={() => setDialogOpen(false)}
          onCreated={() => {
            setDialogOpen(false);
            notify('Portal user created.');
            setReloadTick(tick => tick + 1);
          }}
        />
      ) : null}
    </>
  );
}
