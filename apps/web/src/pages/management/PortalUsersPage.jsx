/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
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
  deactivatePortalUser,
  listUsersPage,
  restorePortalUser,
  setUserStatus,
  unlockUser,
} from '../../api/endpoints.js';
import { createCursorPageAdapter } from '../../grid/cursorPageAdapter.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
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
 * `/management/portal-users` (I0002-R005/R006): browse portal-user
 * accounts; create, deactivate, or restore one. Napsoft login recovery
 * (I0008-R013–R016): view memberships, reset the password, unlock, and
 * disable or re-enable a login.
 */
export function PortalUsersPage() {
  const fetchPage = useMemo(() => createCursorPageAdapter(listUsersPage), []);
  const [resetKey, setResetKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionError, setActionError] = useState(null);
  const { can, onError } = useCapabilities();
  const canRead = can('admin-tenancy::accounts::read', 'napsoft');
  const canWrite = can('admin-tenancy::accounts::write', 'napsoft');
  const [membershipsOf, setMembershipsOf] = useState(null);
  const [resetting, setResetting] = useState(null);

  /** Run a row action, then reload the grid or report its failure. */
  async function act(action) {
    setActionError(null);
    try {
      await action();
      setResetKey(key => key + 1);
    } catch (err) {
      onError(err);
      setActionError(describeActionError(err));
    }
  }

  usePageHeader({
    title: 'Portal Users',
    actions: canWrite ? (
      <Button
        variant="contained"
        size="small"
        onClick={() => setDialogOpen(true)}
      >
        Create portal user
      </Button>
    ) : null,
  });

  async function handleDeactivate(row) {
    setActionError(null);
    try {
      await deactivatePortalUser(row.id);
      setResetKey(key => key + 1);
    } catch (err) {
      onError(err);
      setActionError(describeActionError(err));
    }
  }

  async function handleRestore(row) {
    setActionError(null);
    try {
      await restorePortalUser(row.id);
      setResetKey(key => key + 1);
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
        emptyMessage="No portal users yet."
      />
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
            setResetKey(key => key + 1);
          }}
        />
      ) : null}
      {dialogOpen ? (
        <CreatePortalUserDialog
          onClose={() => setDialogOpen(false)}
          onCreated={() => {
            setDialogOpen(false);
            setResetKey(key => key + 1);
          }}
        />
      ) : null}
    </>
  );
}
