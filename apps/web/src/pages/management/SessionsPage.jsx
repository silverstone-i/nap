/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import LogoutIcon from '@mui/icons-material/Logout';
import { ApiError } from '../../api/client.js';
import { denialMessage } from '../../auth/capabilities.js';
import { useCapabilities } from '../../auth/useCapabilities.js';
import {
  listSessionsPage,
  listTenantsPage,
  revokeSessions,
} from '../../api/endpoints.js';
import { ConfirmDialog } from '../../grid/ConfirmDialog.jsx';
import { createCursorPageAdapter } from '../../grid/cursorPageAdapter.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';

const COLUMNS = [
  {
    field: 'email',
    headerName: 'User',
    flex: 2,
    sortable: false,
    filterable: false,
    priority: 'essential',
  },
  {
    field: 'tenant',
    headerName: 'Tenant',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'secondary',
    valueGetter: tenant => tenant?.code ?? '',
  },
  {
    field: 'startedAt',
    headerName: 'Started',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'essential',
    type: 'dateTime',
  },
  {
    field: 'lastSeenAt',
    headerName: 'Last seen',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'secondary',
    type: 'dateTime',
  },
  {
    field: 'status',
    headerName: 'Status',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'essential',
    renderCell: ({ value }) => (
      <Chip
        size="small"
        label={value === 'active' ? 'Active' : 'Ended'}
        color={value === 'active' ? 'success' : 'default'}
      />
    ),
  },
  {
    field: 'endedAt',
    headerName: 'Ended',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'secondary',
    type: 'dateTime',
  },
];

const REVOKE_TEXT = 'This user is signed out of this session.';

/**
 * Start or end of a `YYYY-MM-DD` day in the browser's time zone, as an ISO
 * instant (I0009-R002).
 * @param {string} day
 * @param {'start'|'end'} edge
 * @returns {string|undefined}
 */
function dayBound(day, edge) {
  if (!day) return undefined;
  const [year, month, date] = day.split('-').map(Number);
  const instant =
    edge === 'start'
      ? new Date(year, month - 1, date, 0, 0, 0, 0)
      : new Date(year, month - 1, date, 23, 59, 59, 999);
  return instant.toISOString();
}

function describeError(err) {
  if (err instanceof ApiError && err.code === 'FORBIDDEN')
    return denialMessage(err);
  return 'Something went wrong. Please try again.';
}

/**
 * `/management/sessions` (I0009-R005–R008, R012): every portal user's
 * sessions, active and ended, with filters, and Revoke for one or many.
 * Revoking one's own session ends it here; the grid's reload then fails
 * `UNAUTHENTICATED`, which sends every tab to `/login` (R013).
 */
export function SessionsPage() {
  const { can, onError } = useCapabilities();
  const canRevoke = can('admin-tenancy::sessions::revoke', 'napsoft');
  const canListTenants = can('admin-tenancy::control::read', 'napsoft');

  const [emailInput, setEmailInput] = useState('');
  const [filters, setFilters] = useState({
    email: '',
    tenantId: '',
    from: '',
    to: '',
    status: 'active',
  });
  const [refreshTick, setRefreshTick] = useState(0);
  const [selected, setSelected] = useState([]);
  const [confirmingBulk, setConfirmingBulk] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [tenants, setTenants] = useState([]);

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

  const fetchPage = useMemo(
    () =>
      createCursorPageAdapter(page =>
        listSessionsPage({
          ...page,
          email: filters.email || undefined,
          tenantId: filters.tenantId || undefined,
          from: dayBound(filters.from, 'start'),
          to: dayBound(filters.to, 'end'),
          status: filters.status === 'all' ? undefined : filters.status,
        })
      ),
    [filters]
  );
  const resetKey = `${JSON.stringify(filters)}:${refreshTick}`;

  /** Revoke sessions, then reload the page or report the failure (R012). */
  async function revoke(ids) {
    setActionError(null);
    try {
      await revokeSessions(ids);
      setRefreshTick(tick => tick + 1);
    } catch (err) {
      onError(err);
      setActionError(describeError(err));
    }
  }

  usePageHeader({
    title: 'Sessions',
    actions:
      canRevoke && selected.length > 0 ? (
        <Button
          variant="contained"
          size="small"
          color="error"
          onClick={() => setConfirmingBulk(true)}
        >
          Revoke selected ({selected.length})
        </Button>
      ) : null,
  });

  function rowActions(row) {
    if (!canRevoke || row.status !== 'active') return [];
    return [
      {
        label: 'Revoke',
        icon: <LogoutIcon fontSize="small" />,
        destructive: true,
        confirmDescription: REVOKE_TEXT,
        onClick: target => revoke([target.id]),
      },
    ];
  }

  // A typed email applies on Enter or when the field loses focus, not on
  // every keystroke, so each letter does not start a new request.
  const applyEmail = () =>
    setFilters(prev => ({ ...prev, email: emailInput.trim() }));

  const setFilter = key => event =>
    setFilters(prev => ({ ...prev, [key]: event.target.value }));

  return (
    <>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ mb: 2, flexWrap: 'wrap' }}
      >
        <TextField
          size="small"
          label="User email"
          value={emailInput}
          onChange={event => setEmailInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') applyEmail();
          }}
          onBlur={applyEmail}
        />
        {canListTenants ? (
          <TextField
            select
            size="small"
            label="Tenant"
            value={filters.tenantId}
            onChange={setFilter('tenantId')}
            sx={{ minWidth: 160 }}
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
          size="small"
          type="date"
          label="From"
          value={filters.from}
          onChange={setFilter('from')}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small"
          type="date"
          label="To"
          value={filters.to}
          onChange={setFilter('to')}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          select
          size="small"
          label="Status"
          value={filters.status}
          onChange={setFilter('status')}
          sx={{ minWidth: 120 }}
        >
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="ended">Ended</MenuItem>
          <MenuItem value="all">All</MenuItem>
        </TextField>
      </Stack>
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
        onSelectionChange={setSelected}
        emptyMessage="No sessions match these filters."
      />
      {confirmingBulk ? (
        <ConfirmDialog
          open
          title="Revoke selected"
          description={`${selected.length} session${
            selected.length === 1 ? '' : 's'
          } will be signed out.`}
          confirmLabel="Revoke"
          onCancel={() => setConfirmingBulk(false)}
          onConfirm={() => {
            setConfirmingBulk(false);
            revoke(selected);
          }}
        />
      ) : null}
    </>
  );
}
