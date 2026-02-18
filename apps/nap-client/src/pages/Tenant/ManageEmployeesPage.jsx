/**
 * @file Manage Employees page — DataGrid list with create / edit / archive / restore
 * @module nap-client/pages/Tenant/ManageEmployeesPage
 *
 * Employees are the source of truth for app access. The is_app_user toggle
 * drives creation/archival of the linked nap_users login record server-side.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useArchiveEmployee,
  useRestoreEmployee,
} from '../../hooks/useEmployees.js';
import {
  pageContainerSx,
  formGridSx,
  formFullSpanSx,
} from '../../config/layoutTokens.js';
import {
  buildMutualExclusionHandler,
  deriveSelectionState,
} from '../../utils/selectionUtils.js';

/* ── Empty form shapes ────────────────────────────────────────── */

const BLANK_CREATE = {
  first_name: '',
  last_name: '',
  email: '',
  code: '',
  position: '',
  department: '',
  is_app_user: false,
};

const BLANK_EDIT = {
  first_name: '',
  last_name: '',
  email: '',
  code: '',
  position: '',
  department: '',
  is_app_user: false,
};

const DEPARTMENT_OPTS = ['Engineering', 'Finance', 'Operations', 'Sales', 'HR', 'Admin', 'Other'];

/* ── Column definitions ───────────────────────────────────────── */

const columns = [
  { field: 'first_name', headerName: 'First Name', width: 140 },
  { field: 'last_name', headerName: 'Last Name', width: 140 },
  { field: 'email', headerName: 'Email', flex: 1, minWidth: 200 },
  { field: 'code', headerName: 'Code', width: 100 },
  { field: 'position', headerName: 'Position', width: 140 },
  { field: 'department', headerName: 'Department', width: 130 },
  {
    field: 'is_app_user',
    headerName: 'App User',
    width: 100,
    renderCell: ({ value }) =>
      value ? <Chip label="Yes" color="primary" size="small" /> : <Chip label="No" size="small" variant="outlined" />,
  },
  {
    field: 'deactivated_at',
    headerName: 'Active',
    width: 90,
    valueGetter: (params) => (params.row.deactivated_at ? 'No' : 'Yes'),
  },
];

/* ── Component ────────────────────────────────────────────────── */

export default function ManageEmployeesPage() {
  /* ── queries ─────────────────────────────────────────────── */
  const { data: employeesRes, isLoading } = useEmployees();
  const allRows = employeesRes?.rows ?? [];

  /* ── view filter ─────────────────────────────────────────── */
  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  /* ── mutations ───────────────────────────────────────────── */
  const createMut = useCreateEmployee();
  const updateMut = useUpdateEmployee();
  const archiveMut = useArchiveEmployee();
  const restoreMut = useRestoreEmployee();

  /* ── selection ───────────────────────────────────────────── */
  const [selectionModel, setSelectionModel] = useState([]);

  const {
    selectedRows,
    selected,
    isSingle,
    hasSelection,
    allActive,
    allArchived,
  } = deriveSelectionState(selectionModel, rows);

  const handleSelectionChange = buildMutualExclusionHandler({
    rows,
    prevModel: selectionModel,
    setModel: setSelectionModel,
  });

  /* ── dialog state ────────────────────────────────────────── */
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

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

  /* ── open edit → populate from selected row ──────────────── */
  const openEdit = useCallback(() => {
    if (!selected) return;
    setEditForm({
      first_name: selected.first_name ?? '',
      last_name: selected.last_name ?? '',
      email: selected.email ?? '',
      code: selected.code ?? '',
      position: selected.position ?? '',
      department: selected.department ?? '',
      is_app_user: !!selected.is_app_user,
    });
    setEditOpen(true);
  }, [selected]);

  /* ── CRUD handlers ───────────────────────────────────────── */
  const handleCreate = async () => {
    if (createForm.is_app_user && !createForm.email) {
      toast('Email is required when granting app access', 'error');
      return;
    }
    try {
      await createMut.mutateAsync(createForm);
      toast('Employee created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    if (editForm.is_app_user && !editForm.email) {
      toast('Email is required when granting app access', 'error');
      return;
    }
    try {
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm });
      toast('Employee updated');
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
      toast(targets.length === 1 ? 'Employee archived' : `${targets.length} employees archived`);
      setArchiveOpen(false);
      setSelectionModel([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleRestore = async () => {
    try {
      const targets = selectedRows.filter((r) => !!r.deactivated_at);
      for (const row of targets) {
        await restoreMut.mutateAsync({ id: row.id });
      }
      toast(targets.length === 1 ? 'Employee restored' : `${targets.length} employees restored`);
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
        { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
        { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
        { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
      ],
      filters: [],
      primaryActions: [
        {
          label: 'Create Employee',
          variant: 'contained',
          color: 'primary',
          onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); },
        },
        { label: 'Edit Employee', variant: 'outlined', disabled: !isSingle, onClick: openEdit },
        {
          label: selectedRows.length > 1 ? `Archive (${selectedRows.length})` : 'Archive',
          variant: 'outlined',
          color: 'error',
          disabled: !hasSelection || !allActive,
          onClick: () => setArchiveOpen(true),
        },
        {
          label: selectedRows.length > 1 ? `Restore (${selectedRows.length})` : 'Restore',
          variant: 'outlined',
          color: 'success',
          disabled: !hasSelection || !allArchived,
          onClick: () => setRestoreOpen(true),
        },
      ],
    }),
    [selected, isSingle, hasSelection, allActive, allArchived, selectedRows.length, viewFilter, openEdit],
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

      {/* ── Create Dialog ────────────────────────────────────── */}
      <FormDialog
        open={createOpen}
        title="Create Employee"
        maxWidth="sm"
        submitLabel="Create"
        loading={createMut.isPending}
        onSubmit={handleCreate}
        onCancel={() => setCreateOpen(false)}
      >
        <Box sx={formGridSx}>
          <TextField label="First Name" required value={createForm.first_name} onChange={onCreateField('first_name')} />
          <TextField label="Last Name" required value={createForm.last_name} onChange={onCreateField('last_name')} />
          <TextField label="Email" type="email" value={createForm.email} onChange={onCreateField('email')} />
          <TextField label="Employee Code" value={createForm.code} onChange={onCreateField('code')} inputProps={{ maxLength: 16 }} />
          <TextField label="Position" value={createForm.position} onChange={onCreateField('position')} />
          <TextField label="Department" select value={createForm.department} onChange={onCreateField('department')}>
            <MenuItem value="">None</MenuItem>
            {DEPARTMENT_OPTS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
          </TextField>
          <FormControlLabel
            control={
              <Switch
                checked={createForm.is_app_user}
                onChange={(e) => setCreateForm((p) => ({ ...p, is_app_user: e.target.checked }))}
              />
            }
            label="Grant app access"
            sx={formFullSpanSx}
          />
          {createForm.is_app_user && (
            <Typography variant="caption" color="text.secondary" sx={formFullSpanSx}>
              A login account will be created with an initial &quot;invited&quot; status.
              The employee must change their password on first login.
              {!createForm.email && (
                <Typography component="span" variant="caption" color="error.main"> Email is required.</Typography>
              )}
            </Typography>
          )}
        </Box>
      </FormDialog>

      {/* ── Edit Dialog ────────────────────────────────────── */}
      <FormDialog
        open={editOpen}
        title="Edit Employee"
        maxWidth="sm"
        submitLabel="Save Changes"
        loading={updateMut.isPending}
        onSubmit={handleUpdate}
        onCancel={() => setEditOpen(false)}
      >
        <Box sx={formGridSx}>
          <TextField label="First Name" required value={editForm.first_name} onChange={onEditField('first_name')} />
          <TextField label="Last Name" required value={editForm.last_name} onChange={onEditField('last_name')} />
          <TextField label="Email" type="email" value={editForm.email} onChange={onEditField('email')} />
          <TextField label="Employee Code" value={editForm.code} onChange={onEditField('code')} inputProps={{ maxLength: 16 }} />
          <TextField label="Position" value={editForm.position} onChange={onEditField('position')} />
          <TextField label="Department" select value={editForm.department} onChange={onEditField('department')}>
            <MenuItem value="">None</MenuItem>
            {DEPARTMENT_OPTS.map((d) => <MenuItem key={d} value={d}>{d}</MenuItem>)}
          </TextField>
          <FormControlLabel
            control={
              <Switch
                checked={editForm.is_app_user}
                onChange={(e) => setEditForm((p) => ({ ...p, is_app_user: e.target.checked }))}
              />
            }
            label="Grant app access"
            sx={formFullSpanSx}
          />
          {editForm.is_app_user && !selected?.is_app_user && (
            <Typography variant="caption" color="text.secondary" sx={formFullSpanSx}>
              A login account will be created (or restored) with &quot;invited&quot; status.
              {!editForm.email && (
                <Typography component="span" variant="caption" color="error.main"> Email is required.</Typography>
              )}
            </Typography>
          )}
          {!editForm.is_app_user && selected?.is_app_user && (
            <Typography variant="caption" color="warning.main" sx={formFullSpanSx}>
              The linked login account will be archived. The employee will no longer be able to log in.
            </Typography>
          )}
        </Box>
      </FormDialog>

      {/* ── Archive Confirmation ────────────────────────────── */}
      <ConfirmDialog
        open={archiveOpen}
        title="Archive Employee"
        message={
          hasSelection
            ? selectedRows.length === 1
              ? `Are you sure you want to archive "${selectedRows[0].first_name} ${selectedRows[0].last_name}"? If they have app access, their login will also be archived.`
              : `Are you sure you want to archive ${selectedRows.length} employees? Any linked login accounts will also be archived.`
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
        title="Restore Employee"
        message={
          hasSelection
            ? selectedRows.length === 1
              ? `Restore "${selectedRows[0].first_name} ${selectedRows[0].last_name}"? If they had app access, their login will also be restored.`
              : `Restore ${selectedRows.length} employees? Any linked login accounts will also be restored.`
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
