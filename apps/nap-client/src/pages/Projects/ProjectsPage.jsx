/**
 * @file Projects CRUD page — DataGrid + create/edit/archive/restore
 * @module nap-client/pages/Projects/ProjectsPage
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import { DataGrid } from '@mui/x-data-grid';

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import CurrencyCell from '../../components/shared/CurrencyCell.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useProjects, useCreateProject, useUpdateProject, useArchiveProject, useRestoreProject,
} from '../../hooks/useProjects.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const STATUS_OPTS = ['active', 'planning', 'on_hold', 'completed', 'cancelled'];
const cap = (s) => (s ? s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '');

const BLANK_CREATE = { project_code: '', name: '', description: '', status: 'active', contract_amount: '' };
const BLANK_EDIT = { name: '', description: '', status: 'active', contract_amount: '' };

const columns = [
  { field: 'project_code', headerName: 'Code', width: 120 },
  { field: 'name', headerName: 'Project Name', flex: 1, minWidth: 200 },
  { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusBadge status={value} /> },
  { field: 'contract_amount', headerName: 'Contract', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  {
    field: 'deactivated_at',
    headerName: 'Active',
    width: 90,
    valueGetter: (params) => (params.row.deactivated_at ? 'No' : 'Yes'),
  },
];

export default function ProjectsPage() {
  const { data: res, isLoading } = useProjects();
  const allRows = res?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateProject();
  const updateMut = useUpdateProject();
  const archiveMut = useArchiveProject();
  const restoreMut = useRestoreProject();

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

  const openEdit = useCallback(() => {
    if (!selected) return;
    setEditForm({ name: selected.name ?? '', description: selected.description ?? '', status: selected.status ?? 'active', contract_amount: selected.contract_amount ?? '' });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => { try { await createMut.mutateAsync({ ...createForm, contract_amount: Number(createForm.contract_amount) || 0 }); toast('Project created'); setCreateOpen(false); setCreateForm(BLANK_CREATE); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleUpdate = async () => { try { await updateMut.mutateAsync({ filter: { id: selected.id }, changes: { ...editForm, contract_amount: Number(editForm.contract_amount) || 0 } }); toast('Project updated'); setEditOpen(false); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleArchive = async () => { try { await archiveMut.mutateAsync({ id: selected.id }); toast('Project archived'); setArchiveOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleRestore = async () => { try { await restoreMut.mutateAsync({ id: selected.id }); toast('Project restored'); setRestoreOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };

  const toolbar = useMemo(() => ({
    tabs: [
      { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
      { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
      { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
    ],
    filters: [],
    primaryActions: [
      { label: 'Create Project', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
      { label: 'Edit', variant: 'outlined', disabled: !selected, onClick: openEdit },
      { label: 'Archive', variant: 'outlined', color: 'error', disabled: !selected || isArchived, onClick: () => setArchiveOpen(true) },
      { label: 'Restore', variant: 'outlined', color: 'success', disabled: !selected || !isArchived, onClick: () => setRestoreOpen(true) },
    ],
  }), [selected, isArchived, viewFilter, openEdit]);
  useModuleToolbarRegistration(toolbar);

  return (
    <Box sx={pageContainerSx}>
      <DataGrid rows={rows} columns={columns} getRowId={(r) => r.id} loading={isLoading} checkboxSelection disableMultipleRowSelection rowSelectionModel={selectionModel} onRowSelectionModelChange={setSelectionModel} pageSizeOptions={[25, 50, 100]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')} />

      <FormDialog open={createOpen} title="Create Project" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Project Code" required value={createForm.project_code} onChange={onCreateField('project_code')} inputProps={{ maxLength: 32 }} />
        <TextField label="Project Name" required value={createForm.name} onChange={onCreateField('name')} />
        <TextField label="Status" select value={createForm.status} onChange={onCreateField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Contract Amount" type="number" value={createForm.contract_amount} onChange={onCreateField('contract_amount')} />
        <TextField label="Description" multiline minRows={2} value={createForm.description} onChange={onCreateField('description')} />
      </FormDialog>

      <FormDialog open={editOpen} title="Edit Project" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        {selected && <TextField label="Project Code" value={selected.project_code} disabled />}
        <TextField label="Project Name" required value={editForm.name} onChange={onEditField('name')} />
        <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Contract Amount" type="number" value={editForm.contract_amount} onChange={onEditField('contract_amount')} />
        <TextField label="Description" multiline minRows={2} value={editForm.description} onChange={onEditField('description')} />
      </FormDialog>

      <ConfirmDialog open={archiveOpen} title="Archive Project" message={selected ? `Archive "${selected.name}" (${selected.project_code})?` : ''} confirmLabel="Archive" confirmColor="error" loading={archiveMut.isPending} onConfirm={handleArchive} onCancel={() => setArchiveOpen(false)} />
      <ConfirmDialog open={restoreOpen} title="Restore Project" message={selected ? `Restore "${selected.name}" (${selected.project_code})?` : ''} confirmLabel="Restore" confirmColor="success" loading={restoreMut.isPending} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
