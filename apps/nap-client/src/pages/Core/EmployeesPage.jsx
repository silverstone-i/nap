/**
 * @file Employees CRUD page — DataGrid + create/edit/archive/restore with is_app_user toggle
 * @module nap-client/pages/Core/EmployeesPage
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import { DataGrid } from '@mui/x-data-grid';

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useEmployees, useCreateEmployee, useUpdateEmployee, useArchiveEmployee, useRestoreEmployee,
} from '../../hooks/useEmployees.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const BLANK_CREATE = {
  first_name: '', last_name: '', code: '', position: '', department: '', email: '', is_app_user: false,
};
const BLANK_EDIT = {
  first_name: '', last_name: '', code: '', position: '', department: '', email: '', is_app_user: false,
};

const columns = [
  { field: 'code', headerName: 'Code', width: 100 },
  { field: 'first_name', headerName: 'First Name', width: 140 },
  { field: 'last_name', headerName: 'Last Name', width: 140 },
  { field: 'position', headerName: 'Position', width: 140 },
  { field: 'department', headerName: 'Department', width: 140 },
  { field: 'email', headerName: 'Email', flex: 1, minWidth: 200 },
  {
    field: 'is_app_user',
    headerName: 'App User',
    width: 100,
    valueGetter: (params) => (params.row.is_app_user ? 'Yes' : 'No'),
  },
  {
    field: 'is_active',
    headerName: 'Active',
    width: 100,
    renderCell: ({ value }) => <StatusBadge status={value ? 'active' : 'suspended'} />,
  },
];

export default function EmployeesPage() {
  const { data: res, isLoading } = useEmployees();
  const allRows = res?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateEmployee();
  const updateMut = useUpdateEmployee();
  const archiveMut = useArchiveEmployee();
  const restoreMut = useRestoreEmployee();

  const [selectionModel, setSelectionModel] = useState([]);
  const selected = rows.find((r) => r.id === selectionModel[0]) ?? null;
  const isArchived = !!selected?.deactivated_at;

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const [createForm, setCreateForm] = useState(BLANK_CREATE);
  const [editForm, setEditForm] = useState(BLANK_EDIT);

  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  const onCreateField = (f) => (e) => setCreateForm((p) => ({ ...p, [f]: e.target.value }));
  const onEditField = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.value }));
  const onCreateCheck = (f) => (e) => setCreateForm((p) => ({ ...p, [f]: e.target.checked }));
  const onEditCheck = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.checked }));

  const openEdit = useCallback(() => {
    if (!selected) return;
    setEditForm({
      first_name: selected.first_name ?? '',
      last_name: selected.last_name ?? '',
      code: selected.code ?? '',
      position: selected.position ?? '',
      department: selected.department ?? '',
      email: selected.email ?? '',
      is_app_user: !!selected.is_app_user,
    });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => {
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
      await archiveMut.mutateAsync({ id: selected.id });
      toast('Employee archived');
      setArchiveOpen(false);
      setSelectionModel([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleRestore = async () => {
    try {
      await restoreMut.mutateAsync({ id: selected.id });
      toast('Employee restored');
      setRestoreOpen(false);
      setSelectionModel([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const toolbar = useMemo(
    () => ({
      tabs: [
        { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
        { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
        { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
      ],
      filters: [],
      primaryActions: [
        { label: 'Create Employee', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
        { label: 'Edit', variant: 'outlined', disabled: !selected, onClick: openEdit },
        { label: 'Archive', variant: 'outlined', color: 'error', disabled: !selected || isArchived, onClick: () => setArchiveOpen(true) },
        { label: 'Restore', variant: 'outlined', color: 'success', disabled: !selected || !isArchived, onClick: () => setRestoreOpen(true) },
      ],
    }),
    [selected, isArchived, viewFilter, openEdit],
  );
  useModuleToolbarRegistration(toolbar);

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
        getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')}
      />

      <FormDialog open={createOpen} title="Create Employee" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="First Name" required value={createForm.first_name} onChange={onCreateField('first_name')} />
        <TextField label="Last Name" required value={createForm.last_name} onChange={onCreateField('last_name')} />
        <TextField label="Code" value={createForm.code} onChange={onCreateField('code')} inputProps={{ maxLength: 16 }} />
        <TextField label="Position" value={createForm.position} onChange={onCreateField('position')} />
        <TextField label="Department" value={createForm.department} onChange={onCreateField('department')} />
        <TextField label="Email" type="email" value={createForm.email} onChange={onCreateField('email')} helperText={createForm.is_app_user && !createForm.email ? 'Email required for app users' : ''} error={createForm.is_app_user && !createForm.email} />
        <FormControlLabel control={<Checkbox checked={createForm.is_app_user} onChange={onCreateCheck('is_app_user')} />} label="App User (creates login account)" />
      </FormDialog>

      <FormDialog open={editOpen} title="Edit Employee" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <TextField label="First Name" required value={editForm.first_name} onChange={onEditField('first_name')} />
        <TextField label="Last Name" required value={editForm.last_name} onChange={onEditField('last_name')} />
        <TextField label="Code" value={editForm.code} onChange={onEditField('code')} inputProps={{ maxLength: 16 }} />
        <TextField label="Position" value={editForm.position} onChange={onEditField('position')} />
        <TextField label="Department" value={editForm.department} onChange={onEditField('department')} />
        <TextField label="Email" type="email" value={editForm.email} onChange={onEditField('email')} helperText={editForm.is_app_user && !editForm.email ? 'Email required for app users' : ''} error={editForm.is_app_user && !editForm.email} />
        <FormControlLabel control={<Checkbox checked={editForm.is_app_user} onChange={onEditCheck('is_app_user')} />} label="App User (creates login account)" />
      </FormDialog>

      <ConfirmDialog open={archiveOpen} title="Archive Employee" message={selected ? `Archive "${selected.first_name} ${selected.last_name}"? ${selected.is_app_user ? 'Their login account will also be locked.' : ''}` : ''} confirmLabel="Archive" confirmColor="error" loading={archiveMut.isPending} onConfirm={handleArchive} onCancel={() => setArchiveOpen(false)} />
      <ConfirmDialog open={restoreOpen} title="Restore Employee" message={selected ? `Restore "${selected.first_name} ${selected.last_name}"?` : ''} confirmLabel="Restore" confirmColor="success" loading={restoreMut.isPending} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
