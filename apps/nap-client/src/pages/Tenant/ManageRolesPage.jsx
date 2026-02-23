/**
 * @file Manage Roles page — DataGrid list with create / edit for tenant-scope RBAC roles
 * @module nap-client/pages/Tenant/ManageRolesPage
 *
 * Roles with is_immutable=true cannot be edited.
 * Roles with is_system=true are visually distinguished.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';
import { DataGrid } from '@mui/x-data-grid';

import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import { useRoles, useCreateRole, useUpdateRole } from '../../hooks/useRoles.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

/* ── Enums ────────────────────────────────────────────────────── */

const SCOPE_OPTS = ['all_projects', 'assigned_companies', 'assigned_projects', 'self'];

/* ── Helpers ──────────────────────────────────────────────────── */

const cap = (s) =>
  s
    ? s
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : '';

/* ── Empty form shapes ────────────────────────────────────────── */

const BLANK_CREATE = { code: '', name: '', description: '', scope: 'all_projects' };
const BLANK_EDIT = { name: '', description: '', scope: 'all_projects' };

/* ── Column definitions ───────────────────────────────────────── */

const columns = [
  { field: 'code', headerName: 'Code', width: 160 },
  { field: 'name', headerName: 'Name', flex: 1, minWidth: 180 },
  { field: 'description', headerName: 'Description', flex: 1, minWidth: 200 },
  {
    field: 'scope',
    headerName: 'Scope',
    width: 180,
    valueGetter: (params) => cap(params.row.scope),
  },
  {
    field: 'is_system',
    headerName: 'System',
    width: 100,
    renderCell: (params) => (params.row.is_system ? <Chip label="System" size="small" color="info" /> : null),
  },
  {
    field: 'is_immutable',
    headerName: 'Immutable',
    width: 110,
    renderCell: (params) =>
      params.row.is_immutable ? <Chip label="Locked" size="small" color="warning" /> : null,
  },
];

/* ── Component ────────────────────────────────────────────────── */

export default function ManageRolesPage() {
  /* ── queries ─────────────────────────────────────────────── */
  const { data: res, isLoading } = useRoles();
  const rows = res?.rows ?? [];

  /* ── mutations ───────────────────────────────────────────── */
  const createMut = useCreateRole();
  const updateMut = useUpdateRole();

  /* ── selection ───────────────────────────────────────────── */
  const [selectionModel, setSelectionModel] = useState([]);
  const selected = rows.find((r) => r.id === selectionModel[0]) ?? null;

  /* ── dialog state ────────────────────────────────────────── */
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  /* ── form state ──────────────────────────────────────────── */
  const [createForm, setCreateForm] = useState(BLANK_CREATE);
  const [editForm, setEditForm] = useState(BLANK_EDIT);

  /* ── snackbar ────────────────────────────────────────────── */
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  /* ── field change factories ──────────────────────────────── */
  const onCreateField = (f) => (e) => setCreateForm((p) => ({ ...p, [f]: e.target.value }));
  const onEditField = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.value }));

  const openEdit = useCallback(() => {
    if (!selected) return;
    setEditForm({
      name: selected.name ?? '',
      description: selected.description ?? '',
      scope: selected.scope ?? 'all_projects',
    });
    setEditOpen(true);
  }, [selected]);

  /* ── CRUD handlers ───────────────────────────────────────── */
  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(createForm);
      toast('Role created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm });
      toast('Role updated');
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
        {
          label: 'Create Role',
          variant: 'contained',
          color: 'primary',
          onClick: () => {
            setCreateForm(BLANK_CREATE);
            setCreateOpen(true);
          },
        },
        {
          label: 'Edit',
          variant: 'outlined',
          disabled: !selected || !!selected?.is_immutable,
          onClick: openEdit,
        },
      ],
    }),
    [selected, openEdit],
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
        disableMultipleRowSelection
        rowSelectionModel={selectionModel}
        onRowSelectionModelChange={setSelectionModel}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
      />

      {/* ── Create Dialog ────────────────────────────────────── */}
      <FormDialog
        open={createOpen}
        title="Create Role"
        submitLabel="Create"
        loading={createMut.isPending}
        onSubmit={handleCreate}
        onCancel={() => setCreateOpen(false)}
      >
        <TextField label="Code" required value={createForm.code} onChange={onCreateField('code')} inputProps={{ maxLength: 64 }} />
        <TextField label="Name" required value={createForm.name} onChange={onCreateField('name')} inputProps={{ maxLength: 128 }} />
        <TextField label="Description" value={createForm.description} onChange={onCreateField('description')} inputProps={{ maxLength: 255 }} />
        <TextField label="Scope" select value={createForm.scope} onChange={onCreateField('scope')}>
          {SCOPE_OPTS.map((s) => (
            <MenuItem key={s} value={s}>
              {cap(s)}
            </MenuItem>
          ))}
        </TextField>
      </FormDialog>

      {/* ── Edit Dialog ──────────────────────────────────────── */}
      <FormDialog
        open={editOpen}
        title="Edit Role"
        submitLabel="Save Changes"
        loading={updateMut.isPending}
        onSubmit={handleUpdate}
        onCancel={() => setEditOpen(false)}
      >
        {selected && <TextField label="Code" value={selected.code} disabled />}
        <TextField label="Name" required value={editForm.name} onChange={onEditField('name')} inputProps={{ maxLength: 128 }} />
        <TextField label="Description" value={editForm.description} onChange={onEditField('description')} inputProps={{ maxLength: 255 }} />
        <TextField label="Scope" select value={editForm.scope} onChange={onEditField('scope')}>
          {SCOPE_OPTS.map((s) => (
            <MenuItem key={s} value={s}>
              {cap(s)}
            </MenuItem>
          ))}
        </TextField>
      </FormDialog>

      {/* ── Snackbar ───────────────────────────────────────── */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
