/**
 * @file Manage Users page — read-only list with status & password management
 * @module nap-client/pages/Tenant/ManageUsersPage
 *
 * nap_users is a pure identity/authentication table. User creation is handled
 * at the entity level (e.g. employee is_app_user toggle). This page lets
 * NapSoft admins view all app users, change status (active/invited/locked),
 * and reset passwords.
 *
 * Migrated to standardised list-view selection system:
 *   useListSelection + DataTable + RowActionsMenu
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import DataTable from '../../components/shared/DataTable.jsx';
import FieldRow from '../../components/shared/FieldRow.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import PasswordField from '../../components/shared/PasswordField.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import { useUsers, useUpdateUser } from '../../hooks/useUsers.js';
import { pageContainerSx } from '../../config/layoutTokens.js';
import { useListSelection } from '../../hooks/useListSelection.js';

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

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

const detailGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
  gap: 1.5,
};

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
  const selection = useListSelection(rows, 'user');
  const { selectedRows } = selection;

  /* ── dialog state ────────────────────────────────────────── */
  const [viewOpen, setViewOpen] = useState(false);
  const [viewUser, setViewUser] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);

  /* ── form state ──────────────────────────────────────────── */
  const [editForm, setEditForm] = useState(BLANK_EDIT);

  /* ── snackbar ────────────────────────────────────────────── */
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  /* ── field change factories ──────────────────────────────── */
  const onEditField = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.value }));

  /* ── Row action callbacks ──────────────────────────────────── */
  const handleView = useCallback((row) => {
    setViewUser(row);
    setViewOpen(true);
  }, []);

  const handleEdit = useCallback((row) => {
    setEditRow(row);
    setEditForm({
      email: row.email ?? '',
      status: row.status ?? 'active',
      password: '',
    });
    setEditOpen(true);
  }, []);

  /* ── CRUD handlers ───────────────────────────────────────── */
  const handleUpdate = async () => {
    try {
      const { password, ...fields } = editForm;
      const changes = {
        ...fields,
        ...(password ? { password } : {}),
      };
      await updateMut.mutateAsync({ filter: { id: editRow.id }, changes });
      toast('User updated');
      setEditOpen(false);
      setEditRow(null);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  /* ── toolbar registration ────────────────────────────────── */
  const toolbar = useMemo(
    () => ({
      tabs: [],
      filters: [],
      primaryActions: [],
    }),
    [selectedRows.length],
  );
  useModuleToolbarRegistration(toolbar);

  /* ── render ──────────────────────────────────────────────── */
  return (
    <Box sx={pageContainerSx}>
      <DataTable
        rows={rows}
        columns={columns}
        loading={isLoading}
        selection={selection}
        onView={handleView}
        onEdit={handleEdit}
      />

      {/* ── View Details Dialog ──────────────────────────────── */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start' }}>
          <Box>
            <span>User Details</span>
            {viewUser && (
              <Typography variant="body2" color="text.secondary">
                {viewUser.email}
              </Typography>
            )}
          </Box>
          <Box sx={{ ml: 'auto' }}>
            <Button size="small" color="inherit" onClick={() => setViewOpen(false)}>
              Close
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {viewUser && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={detailGridSx}>
                <FieldRow label="Email" value={viewUser.email} />
                <FieldRow label="Entity Type" value={cap(viewUser.entity_type) || '\u2014'} />
                <FieldRow label="Status">
                  <StatusBadge status={viewUser.status} />
                </FieldRow>
                <FieldRow label="Created" value={fmtDate(viewUser.created_at)} />
                <FieldRow label="Updated" value={fmtDate(viewUser.updated_at)} />
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ────────────────────────────────────── */}
      <FormDialog
        open={editOpen}
        title="Edit User"
        submitLabel="Save Changes"
        loading={updateMut.isPending}
        submitDisabled={!!editForm.password && !PW_RULES.every((r) => r.test(editForm.password))}
        onSubmit={handleUpdate}
        onCancel={() => { setEditOpen(false); setEditRow(null); }}
      >
        {editRow && <TextField label="Email" value={editRow.email} disabled />}
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
