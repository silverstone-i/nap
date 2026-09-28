/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { ApiError } from '../../api/client.js';
import { denialMessage } from '../../auth/capabilities.js';
import {
  listTenantsPage,
  retryTenantProvisioning,
} from '../../api/endpoints.js';
import { createCursorPageAdapter } from '../../grid/cursorPageAdapter.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import { useCapabilities } from '../../auth/useCapabilities.js';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { CreateTenantDialog } from './CreateTenantDialog.jsx';
import { ProvisionTenantDialog } from './ProvisionTenantDialog.jsx';

export const REFRESH_MS = 2000;

/**
 * Flatten a tenant row and its provisioning job for the grid.
 * @param {object} row
 * @returns {object}
 */
function mapRow({ job, ...tenant }) {
  return {
    ...tenant,
    stage: job?.stage ?? null,
    jobStatus: job?.status ?? null,
    attempts: job?.attempts ?? null,
    failureCode: job?.failureCode ?? null,
  };
}

function describeActionError(err) {
  if (err instanceof ApiError && err.code === 'INVALID_STATE')
    return 'This tenant cannot perform that action right now.';
  if (err instanceof ApiError && err.code === 'FORBIDDEN')
    return denialMessage(err);
  if (err instanceof ApiError && err.code === 'NOT_FOUND')
    return 'This tenant has no provisioning job.';
  return 'Something went wrong. Please try again.';
}

const COLUMNS = [
  {
    field: 'code',
    headerName: 'Code',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'essential',
  },
  {
    field: 'name',
    headerName: 'Name',
    flex: 2,
    sortable: false,
    filterable: false,
    priority: 'essential',
  },
  {
    field: 'tier',
    headerName: 'Tier',
    flex: 1,
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
    field: 'cellId',
    headerName: 'Cell',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'secondary',
  },
  {
    field: 'provisioned',
    headerName: 'Provisioned',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'secondary',
    type: 'boolean',
  },
  {
    field: 'rbacReady',
    headerName: 'RBAC ready',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'secondary',
    type: 'boolean',
  },
  {
    field: 'stage',
    headerName: 'Stage',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'secondary',
  },
  {
    field: 'jobStatus',
    headerName: 'Provisioning',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'secondary',
  },
  {
    field: 'failureCode',
    headerName: 'Failure',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'secondary',
  },
];

/**
 * `/management/tenants` (I0002-R001): browse central tenant records, create
 * one, and provision it into a cell (I0006-R010–R012).
 */
export function TenantsPage() {
  const [active, setActive] = useState(false);
  // I0006-R011: `anyActive` covers every page, not just the one shown.
  const fetchPage = useMemo(
    () =>
      createCursorPageAdapter(
        async page => {
          const result = await listTenantsPage(page);
          setActive(result.anyActive);
          return result;
        },
        { mapRow }
      ),
    []
  );
  const [resetKey, setResetKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [provisionRow, setProvisionRow] = useState(null);
  const [actionError, setActionError] = useState(null);
  const { can, onError } = useCapabilities();
  const canWrite = can('admin-tenancy::control::write', 'napsoft');

  // I0006-R011: refresh while any tenant job is queued or running.
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setResetKey(key => key + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, [active]);

  usePageHeader({
    title: 'Tenants',
    actions: canWrite ? (
      <Button
        variant="contained"
        size="small"
        onClick={() => setDialogOpen(true)}
      >
        Create tenant
      </Button>
    ) : null,
  });

  async function handleRetry(row) {
    setActionError(null);
    try {
      await retryTenantProvisioning({ tenant: row.id });
      setResetKey(key => key + 1);
    } catch (err) {
      onError(err);
      setActionError(describeActionError(err));
    }
  }

  function rowActions(row) {
    if (!canWrite) return [];
    const actions = [];
    // I0006-R010: only a pending tenant with no job can be provisioned. The
    // Napsoft tenant is never pending, and the server rejects it regardless.
    if (row.status === 'pending' && !row.cellId && !row.jobStatus)
      actions.push({ label: 'Provision', onClick: setProvisionRow });
    // I0006-R012
    if (row.jobStatus === 'failed')
      actions.push({ label: 'Retry', onClick: handleRetry });
    return actions;
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
        emptyMessage="No tenants yet."
      />
      {dialogOpen ? (
        <CreateTenantDialog
          onClose={() => setDialogOpen(false)}
          onCreated={() => {
            setDialogOpen(false);
            setResetKey(key => key + 1);
          }}
        />
      ) : null}
      {provisionRow ? (
        <ProvisionTenantDialog
          tenant={provisionRow}
          onClose={() => setProvisionRow(null)}
          onProvisioned={() => {
            setProvisionRow(null);
            setResetKey(key => key + 1);
          }}
        />
      ) : null}
    </>
  );
}
