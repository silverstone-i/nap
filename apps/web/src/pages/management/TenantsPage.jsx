/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import HandshakeIcon from '@mui/icons-material/Handshake';
import RefreshIcon from '@mui/icons-material/Refresh';
import { ApiError } from '../../api/client.js';
import { denialMessage } from '../../auth/capabilities.js';
import {
  listTenantsPage,
  retryTenantProvisioning,
} from '../../api/endpoints.js';
import { createCursorPageAdapter } from '../../grid/cursorPageAdapter.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import { useCapabilities } from '../../auth/useCapabilities.js';
import { useSession } from '../../auth/SessionContext.jsx';
import { useNotice } from '../../shell/NoticeContext.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { TenantDetailDialog } from './TenantDetailDialog.jsx';

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

/**
 * The grid's columns (I0006-R020). Selecting a tenant's code opens its
 * detail, which holds the tier, cell, readiness, and job.
 * @param {(row: object) => void} onOpen
 * @returns {object[]}
 */
function columnsFor(onOpen) {
  const plain = { sortable: false, filterable: false };
  return [
    {
      ...plain,
      field: 'code',
      headerName: 'Code',
      flex: 1,
      priority: 'essential',
      renderCell: ({ row }) => (
        <Button variant="text" size="small" onClick={() => onOpen(row)}>
          {row.code}
        </Button>
      ),
    },
    {
      ...plain,
      field: 'name',
      headerName: 'Name',
      flex: 2,
      priority: 'essential',
    },
    {
      ...plain,
      field: 'status',
      headerName: 'Status',
      flex: 1,
      priority: 'essential',
    },
  ];
}

/**
 * `/management/tenants` (I0002-R001): browse central tenant records, open
 * one's detail, and retry its provisioning (I0006-R010–R012, R020, R021).
 */
export function TenantsPage() {
  const [active, setActive] = useState(false);
  // The rows of the page last fetched, so an open detail follows the
  // refresh (I0001-R038) instead of showing the row as it was when opened.
  const [pageRows, setPageRows] = useState([]);
  const fetchPage = useMemo(
    () =>
      createCursorPageAdapter(
        async page => {
          const result = await listTenantsPage(page);
          // I0006-R011: `anyActive` covers every page, not just the one shown.
          setActive(result.anyActive);
          return result;
        },
        { mapRow }
      ),
    []
  );
  const [resetKey, setResetKey] = useState(0);
  const [actionError, setActionError] = useState(null);
  const [selected, setSelected] = useState(null);
  // The open record as of the latest refresh.
  const current =
    selected && (pageRows.find(row => row.id === selected.id) ?? selected);
  const notify = useNotice();
  const { can, onError } = useCapabilities();
  const canWrite = can('admin-tenancy::control::write', 'napsoft');
  const navigate = useNavigate();
  const session = useSession();
  const napsoftSelected =
    session.selectedTenant != null &&
    session.selectedTenant.id === session.capabilities?.napsoftTenant?.id;

  // I0006-R011: refresh while any tenant job is queued or running.
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setResetKey(key => key + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, [active]);

  // I0006-R010: tenants are created from a Napsoft client, not here.
  usePageHeader({ title: 'Tenants' });

  async function handleRetry(row) {
    setActionError(null);
    try {
      await retryTenantProvisioning({ tenant: row.id });
      // I0006-R021
      notify(`Retry queued for ${row.code}.`);
      setSelected(null);
      setResetKey(key => key + 1);
    } catch (err) {
      onError(err);
      setActionError(describeActionError(err));
    }
  }

  const canViewClient = row => Boolean(row.clientId) && napsoftSelected;
  const canRetry = row => canWrite && row.jobStatus === 'failed';
  const viewClient = row => navigate(`/directory/clients?open=${row.clientId}`);

  function rowActions(row) {
    const actions = [];
    // A tenant's contacts are on its Napsoft client record, which lives in
    // the Napsoft tenant's directory.
    if (canViewClient(row))
      actions.push({
        label: 'View client',
        // Same icon as Directory → Clients.
        icon: <HandshakeIcon fontSize="small" />,
        onClick: viewClient,
      });
    // I0006-R012
    if (canRetry(row))
      actions.push({
        label: 'Retry',
        icon: <RefreshIcon fontSize="small" />,
        onClick: handleRetry,
      });
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
        columns={columnsFor(setSelected)}
        fetchPage={fetchPage}
        resetKey={resetKey}
        onRowsLoaded={setPageRows}
        rowActions={rowActions}
        selectable={false}
        emptyMessage="No tenants yet."
      />
      {current ? (
        <TenantDetailDialog
          tenant={current}
          onViewClient={
            canViewClient(current) ? () => viewClient(current) : undefined
          }
          onRetry={canRetry(current) ? () => handleRetry(current) : undefined}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}
