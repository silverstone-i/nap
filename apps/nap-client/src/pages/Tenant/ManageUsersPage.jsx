/**
 * @file Manage Users page — DataGrid list with register / edit / archive / restore
 * @module nap-client/pages/Tenant/ManageUsersPage
 *
 * Adapted for pure identity nap_users table (no user_name, full_name, role,
 * tenant_code, tenant_role, phones, addresses). Columns: email, entity_type,
 * status, active. Registration requires email + password + tenant selection.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import PasswordField from '../../components/shared/PasswordField.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import {
  useUsers,
  useRegisterUser,
  useUpdateUser,
  useArchiveUser,
  useRestoreUser,
} from '../../hooks/useUsers.js';
import { useTenants } from '../../hooks/useTenants.js';
import { pageContainerSx } from '../../config/layoutTokens.js';
import { buildMutualExclusionHandler, deriveSelectionState } from '../../utils/selectionUtils.js';

/* ── Enums ────────────────────────────────────────────────────── */

const STATUS_OPTS = ['active', 'invited', 'locked'];

/* ── Empty form shapes ────────────────────────────────────────── */

const BLANK_REGISTER = {
  tenant_id: '',
  email: '',
  password: '',
};

const BLANK_EDIT = {
  email: '',
  status: 'active',
  password: '',
};

const PW_RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'A digit', test: (p) => /[0-9]/.test(p) },
  { label: 'A special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

/* ── Helpers ──────────────────────────────────────────────────── */

const cap = (s) =>
  s
    ? s
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : '';

/* ── Column definitions ───────────────────────────────────────── */

const columns = [
  { field: 'email', headerName: 'Email', flex: 1, minWidth: 220 },
  {
    field: 'entity_type',
    headerName: 'Entity Type',
    width: 140,
    valueGetter: (params) => cap(params.row.entity_type) || '\u2014',
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 110,
    renderCell: ({ value }) => <StatusBadge status={value} />,
  },
  {
    field: 'deactivated_at',
    headerName: 'Active',
    width: 90,
    valueGetter: (params) => (params.row.deactivated_at ? 'No' : 'Yes'),
  },
];

/* ── Component ────────────────────────────────────────────────── */

export default function ManageUsersPage() {
  const { user: currentUser } = useAuth();

  /* ── queries ─────────────────────────────────────────────── */
  const { data: usersRes, isLoading } = useUsers();
  const allRows = usersRes?.rows ?? [];

  const { data: tenantsRes } = useTenants({ limit: 200 });
  const activeTenants = useMemo(
    () => (tenantsRes?.rows ?? []).filter((t) => !t.deactivated_at),
    [tenantsRes],
  );

  /* ── view filter ─────────────────────────────────────────── */
  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  /* ── mutations ───────────────────────────────────────────── */
  const registerMut = useRegisterUser();
  const updateMut = useUpdateUser();
  const archiveMut = useArchiveUser();
  const restoreMut = useRestoreUser();

  /* ── selection (multi-select with root-user mutual exclusion) */
  const [selectionModel, setSelectionModel] = useState([]);

  const { selectedRows, selected, isSingle, hasSelection, hasRootSelected, allActive, allArchived } =
    deriveSelectionState(selectionModel, rows, 'user');

  const hasSelfSelected = selectedRows.some((r) => r.id === currentUser?.id);

  const handleSelectionChange = buildMutualExclusionHandler({
    rows,
    prevModel: selectionModel,
    setModel: setSelectionModel,
    entityType: 'user',
  });

  /* ── dialog state ────────────────────────────────────────── */
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  /* ── form state ──────────────────────────────────────────── */
  const [regForm, setRegForm] = useState(BLANK_REGISTER);
  const [editForm, setEditForm] = useState(BLANK_EDIT);

  /* ── snackbar ────────────────────────────────────────────── */
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  /* ── field change factories ──────────────────────────────── */
  const onRegField = (f) => (e) => setRegForm((p) => ({ ...p, [f]: e.target.value }));
  const onEditField = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.value }));

  const openEdit = useCallback(() => {
    if (!selected) return;
    setEditForm({
      email: selected.email ?? '',
      status: selected.status ?? 'active',
      password: '',
    });
    setEditOpen(true);
  }, [selected]);

  /* ── CRUD handlers ───────────────────────────────────────── */
  const handleRegister = async () => {
    try {
      await registerMut.mutateAsync({
        tenant_id: regForm.tenant_id,
        email: regForm.email,
        password: regForm.password,
      });
      toast('User registered');
      setRegisterOpen(false);
      setRegForm(BLANK_REGISTER);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      const { password, ...fields } = editForm;
      const changes = {
        ...fields,
        ...(password ? { password } : {}),
      };
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes });
      toast('User updated');
      setEditOpen(false);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleArchive = async () => {
    try {
      const targets = selectedRows.filter((r) => !r.deactivated_at);
      for (const row of targets) {
        await archiveMut.mutateAsync({ id: row.id });
      }
      toast(targets.length === 1 ? 'User archived' : `${targets.length} users archived`);
      setArchiveOpen(false);
      setSelectionModel([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleRestore = async () => {
    try {
      const targets = selectedRows.filter((r) => !!r.deactivated_at);
      let warnTenant = false;
      for (const row of targets) {
        try {
          await restoreMut.mutateAsync({ id: row.id });
        } catch (err) {
          const msg = errMsg(err);
          if (msg?.includes('Tenant')) {
            warnTenant = true;
          } else {
            throw err;
          }
        }
      }
      if (warnTenant) {
        toast('Some users could not be restored \u2014 parent tenant inactive', 'warning');
      } else {
        toast(targets.length === 1 ? 'User restored' : `${targets.length} users restored`);
      }
      setRestoreOpen(false);
      setSelectionModel([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  /* ── toolbar registration ────────────────────────────────── */
  const toolbar = useMemo(
    () => ({
      tabs: [
        {
          value: 'active',
          label: 'Active',
          selected: viewFilter === 'active',
          onClick: () => {
            setViewFilter('active');
            setSelectionModel([]);
          },
        },
        {
          value: 'all',
          label: 'All',
          selected: viewFilter === 'all',
          onClick: () => {
            setViewFilter('all');
            setSelectionModel([]);
          },
        },
        {
          value: 'archived',
          label: 'Archived',
          selected: viewFilter === 'archived',
          onClick: () => {
            setViewFilter('archived');
            setSelectionModel([]);
          },
        },
      ],
      filters: [],
      primaryActions: [
        {
          label: 'Register User',
          variant: 'contained',
          color: 'primary',
          onClick: () => {
            setRegForm(BLANK_REGISTER);
            setRegisterOpen(true);
          },
        },
        { label: 'Edit User', variant: 'outlined', disabled: !isSingle, onClick: openEdit },
        {
          label: selectedRows.length > 1 ? `Archive (${selectedRows.length})` : 'Archive',
          variant: 'outlined',
          color: 'error',
          disabled: !hasSelection || !allActive || hasRootSelected || hasSelfSelected,
          onClick: () => setArchiveOpen(true),
        },
        {
          label: selectedRows.length > 1 ? `Restore (${selectedRows.length})` : 'Restore',
          variant: 'outlined',
          color: 'success',
          disabled: !hasSelection || !allArchived || hasRootSelected,
          onClick: () => setRestoreOpen(true),
        },
      ],
    }),
    [
      selected,
      isSingle,
      hasSelection,
      hasRootSelected,
      hasSelfSelected,
      allActive,
      allArchived,
      selectedRows.length,
      viewFilter,
      openEdit,
    ],
  );
  useModuleToolbarRegistration(toolbar);

  /* ── render ──────────────────────────────────────────────── */
  return (
    <Box sx={pageContainerSx}>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        loading={isLoading}
        checkboxSelection
        rowSelectionModel={selectionModel}
        onRowSelectionModelChange={handleSelectionChange}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        getRowClassName={(params) => (params.row.deactivated_at ? 'row-archived' : '')}
      />

      {/* ── Register Dialog ────────────────────────────────── */}
      <FormDialog
        open={registerOpen}
        title="Register User"
        submitLabel="Register"
        loading={registerMut.isPending}
        onSubmit={handleRegister}
        onCancel={() => setRegisterOpen(false)}
      >
        <TextField
          label="Tenant"
          select
          required
          value={regForm.tenant_id}
          onChange={onRegField('tenant_id')}
          helperText="Select the tenant this user belongs to"
        >
          {activeTenants.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.company || t.tenant_code} ({t.tenant_code})
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Email"
          type="email"
          required
          value={regForm.email}
          onChange={onRegField('email')}
        />
        <PasswordField
          label="Password"
          required
          value={regForm.password}
          onChange={onRegField('password')}
        />
      </FormDialog>

      {/* ── Edit Dialog ────────────────────────────────────── */}
      <FormDialog
        open={editOpen}
        title="Edit User"
        submitLabel="Save Changes"
        loading={updateMut.isPending}
        submitDisabled={!!editForm.password && !PW_RULES.every((r) => r.test(editForm.password))}
        onSubmit={handleUpdate}
        onCancel={() => setEditOpen(false)}
      >
        {selected && <TextField label="Email" value={selected.email} disabled />}
        <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
          {STATUS_OPTS.map((s) => (
            <MenuItem key={s} value={s}>
              {cap(s)}
            </MenuItem>
          ))}
        </TextField>

        <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>
          Reset Password
        </Typography>
        <PasswordField
          label="New Password"
          value={editForm.password}
          onChange={onEditField('password')}
          autoComplete="new-password"
          helperText="Leave blank to keep current password"
        />
        {editForm.password && (
          <Box sx={{ mt: 0.5, mb: 1 }}>
            {PW_RULES.map((r) => {
              const pass = r.test(editForm.password);
              return (
                <Box
                  key={r.label}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}
                >
                  <Typography variant="caption" color={pass ? 'success.main' : 'text.secondary'}>
                    {pass ? '\u2713' : '\u2717'} {r.label}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </FormDialog>

      {/* ── Archive Confirmation ────────────────────────────── */}
      <ConfirmDialog
        open={archiveOpen}
        title="Archive User"
        message={
          hasSelection
            ? selectedRows.length === 1
              ? `Are you sure you want to archive "${selectedRows[0].email}"? They will no longer be able to log in.`
              : `Are you sure you want to archive ${selectedRows.length} users? They will no longer be able to log in.`
            : ''
        }
        confirmLabel="Archive"
        confirmColor="error"
        loading={archiveMut.isPending}
        onConfirm={handleArchive}
        onCancel={() => setArchiveOpen(false)}
      />

      {/* ── Restore Confirmation ────────────────────────────── */}
      <ConfirmDialog
        open={restoreOpen}
        title="Restore User"
        message={
          hasSelection
            ? selectedRows.length === 1
              ? `Restore "${selectedRows[0].email}"? If the parent tenant is inactive this will be rejected by the server.`
              : `Restore ${selectedRows.length} users? Users whose parent tenant is inactive will be rejected by the server.`
            : ''
        }
        confirmLabel="Restore"
        confirmColor="success"
        loading={restoreMut.isPending}
        onConfirm={handleRestore}
        onCancel={() => setRestoreOpen(false)}
      />

      {/* ── Snackbar ───────────────────────────────────────── */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snack.sev}
          variant="filled"
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
        >
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
