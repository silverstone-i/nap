/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { ApiError } from '../../api/client.js';
import {
  deactivatePortalUser,
  listUsersPage,
  restorePortalUser,
} from '../../api/endpoints.js';
import { createCursorPageAdapter } from '../../grid/cursorPageAdapter.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { CreatePortalUserDialog } from './CreatePortalUserDialog.jsx';

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
  if (err instanceof ApiError && err.code === 'INVALID_STATE')
    return 'This account cannot perform that action right now.';
  if (err instanceof ApiError && err.code === 'FORBIDDEN')
    return 'You are not authorized to perform that action.';
  if (err instanceof ApiError && err.code === 'NOT_FOUND')
    return 'This account no longer exists.';
  return 'Something went wrong. Please try again.';
}

/**
 * `/management/portal-users` (I0002-R005/R006): browse portal-user
 * accounts; create, deactivate, or restore one. No membership data.
 */
export function PortalUsersPage() {
  const fetchPage = useMemo(() => createCursorPageAdapter(listUsersPage), []);
  const [resetKey, setResetKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionError, setActionError] = useState(null);

  usePageHeader({
    title: 'Portal Users',
    actions: (
      <Button
        variant="contained"
        size="small"
        onClick={() => setDialogOpen(true)}
      >
        Create portal user
      </Button>
    ),
  });

  async function handleDeactivate(row) {
    setActionError(null);
    try {
      await deactivatePortalUser(row.id);
      setResetKey(key => key + 1);
    } catch (err) {
      setActionError(describeActionError(err));
    }
  }

  async function handleRestore(row) {
    setActionError(null);
    try {
      await restorePortalUser(row.id);
      setResetKey(key => key + 1);
    } catch (err) {
      setActionError(describeActionError(err));
    }
  }

  // Mutually exclusive by construction: an archived account can only be
  // restored, an active one only deactivated (I0002-R006). Root is listed
  // for visibility but offers neither — the server rejects both against it
  // (`archiveUser`/`restoreUser` in domain/accounts.js), so no action menu
  // is more honest than one that always errors.
  function rowActions(row) {
    if (row.isRoot) return [];
    return row.deactivatedAt
      ? [{ label: 'Restore', onClick: handleRestore }]
      : [{ label: 'Deactivate', destructive: true, onClick: handleDeactivate }];
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
