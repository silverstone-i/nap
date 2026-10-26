/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import MenuItem from '@mui/material/MenuItem';
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
import { useNotice } from '../../shell/NoticeContext.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { useDebouncedValue } from '../../shell/useDebouncedValue.js';

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
    // I0009-R015: plain text, not a chip.
    valueGetter: value => (value === 'active' ? 'Active' : 'Ended'),
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

const STATUS_LABELS = { active: 'Active', ended: 'Ended', all: 'All' };

/**
 * `/management/sessions` (I0009-R005–R008, R012): every portal user's
 * sessions, active and ended, with filters, and Revoke for one or many.
 * The email search, the filter popover (tenant, dates, status), and Revoke
 * selected sit in the page header (I0001-R028, R029).
 * Revoking one's own session ends it here; the grid's reload then fails
 * `UNAUTHENTICATED`, which sends every tab to `/login` (R013).
 */
export function SessionsPage() {
  const { can, onError } = useCapabilities();
  const notify = useNotice();
  const canRevoke = can('admin-tenancy::sessions::revoke', 'napsoft');
  const canListTenants = can('admin-tenancy::control::read', 'napsoft');

  const [emailInput, setEmailInput] = useState('');
  const email = useDebouncedValue(emailInput.trim());
  const [filters, setFilters] = useState({
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
          email: email || undefined,
          tenantId: filters.tenantId || undefined,
          from: dayBound(filters.from, 'start'),
          to: dayBound(filters.to, 'end'),
          status: filters.status === 'all' ? undefined : filters.status,
        })
      ),
    [filters, email]
  );
  const resetKey = `${JSON.stringify(filters)}:${email}:${refreshTick}`;

  /**
   * Revoke sessions, then report it as a notice (R017) and reload the page,
   * or report the failure (R012).
   */
  async function revoke(ids) {
    setActionError(null);
    try {
      await revokeSessions(ids);
      notify(
        ids.length === 1
          ? 'Session revoked.'
          : `${ids.length} sessions revoked.`
      );
      setRefreshTick(tick => tick + 1);
    } catch (err) {
      onError(err);
      setActionError(describeError(err));
    }
  }

  function rowActions(row) {
    if (!canRevoke || row.status !== 'active') return [];
    return [
      {
        label: 'Revoke',
        icon: <LogoutIcon fontSize="small" />,
        destructive: true,
        confirmTitle: 'Revoke session?',
        confirmDescription: REVOKE_TEXT,
        onClick: target => revoke([target.id]),
      },
    ];
  }

  const setFilter = key => event =>
    setFilters(prev => ({ ...prev, [key]: event.target.value }));
  const clearFilter =
    (key, value = '') =>
    () =>
      setFilters(prev => ({ ...prev, [key]: value }));

  // A chip for each filter away from its default; Active is the default status.
  const chips = [
    filters.tenantId && {
      key: 'tenant',
      label: `Tenant: ${tenants.find(t => t.id === filters.tenantId)?.code ?? 'selected'}`,
      onDelete: clearFilter('tenantId'),
    },
    filters.from && {
      key: 'from',
      label: `From ${filters.from}`,
      onDelete: clearFilter('from'),
    },
    filters.to && {
      key: 'to',
      label: `To ${filters.to}`,
      onDelete: clearFilter('to'),
    },
    filters.status !== 'active' && {
      key: 'status',
      label: `Status: ${STATUS_LABELS[filters.status]}`,
      onDelete: clearFilter('status', 'active'),
    },
  ].filter(Boolean);

  usePageHeader({
    title: 'Sessions',
    search: {
      value: emailInput,
      onChange: setEmailInput,
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
          >
            {Object.entries(STATUS_LABELS).map(([value, text]) => (
              <MenuItem key={value} value={value}>
                {text}
              </MenuItem>
            ))}
          </TextField>
        </>
      ),
      chips,
    },
    actions: [
      canRevoke &&
        selected.length > 0 && {
          label: `Revoke selected (${selected.length})`,
          color: 'warning',
          onClick: () => setConfirmingBulk(true),
        },
    ],
  });

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
        // I0009-R015: an Active list has no Ended time to show.
        columns={
          filters.status === 'active'
            ? COLUMNS.filter(column => column.field !== 'endedAt')
            : COLUMNS
        }
        fetchPage={fetchPage}
        resetKey={resetKey}
        rowActions={rowActions}
        onSelectionChange={setSelected}
        selectable={canRevoke}
        emptyMessage="No sessions match these filters."
      />
      {confirmingBulk ? (
        <ConfirmDialog
          open
          title={
            selected.length === 1
              ? 'Revoke session?'
              : `Revoke ${selected.length} sessions?`
          }
          description={
            selected.length === 1
              ? REVOKE_TEXT
              : 'These users are signed out of these sessions.'
          }
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
