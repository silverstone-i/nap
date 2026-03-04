/**
 * @file Manage Users page — read-only list with status & password management
 * @module nap-client/pages/Tenant/ManageUsersPage
 *
 * nap_users is a pure identity/authentication table. User creation is handled
 * at the entity level (e.g. employee is_app_user toggle). This page lets
 * NapSoft admins view all app users, change status (active/invited/locked),
 * and reset passwords.
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
import FormDialog from '../../components/shared/FormDialog.jsx';
import PasswordField from '../../components/shared/PasswordField.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import { useUsers, useUpdateUser } from '../../hooks/useUsers.js';
import { pageContainerSx } from '../../config/layoutTokens.js';
import { useDataGridSelection } from '../../hooks/useDataGridSelection.js';

/* ── Enums ────────────────────────────────────────────────────── */

const STATUS_OPTS = ['active', 'invited', 'locked'];

/* ── Empty form shapes ────────────────────────────────────────── */

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
];

/* ── Component ────────────────────────────────────────────────── */

export default function ManageUsersPage() {
  /* ── queries ─────────────────────────────────────────────── */
  const { data: usersRes, isLoading } = useUsers();
  const rows = usersRes?.rows ?? [];

  /* ── mutations ───────────────────────────────────────────── */
  const updateMut = useUpdateUser();

  /* ── selection ───────────────────────────────────────────── */
  const { selectionModel, onSelectionChange, selectedRows, selected, isSingle } = useDataGridSelection(rows, 'user');

  /* ── dialog state ────────────────────────────────────────── */
  const [editOpen, setEditOpen] = useState(false);

  /* ── form state ──────────────────────────────────────────── */
  const [editForm, setEditForm] = useState(BLANK_EDIT);

  /* ── snackbar ────────────────────────────────────────────── */
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  /* ── field change factories ──────────────────────────────── */
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

  /* ── toolbar registration ────────────────────────────────── */
  const toolbar = useMemo(
    () => ({
      tabs: [],
      filters: [],
      primaryActions: [
        { label: 'Edit User', variant: 'outlined', disabled: !isSingle, onClick: openEdit },
      ],
    }),
    [isSingle, selectedRows.length, openEdit],
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
        onRowSelectionModelChange={onSelectionChange}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
      />

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
