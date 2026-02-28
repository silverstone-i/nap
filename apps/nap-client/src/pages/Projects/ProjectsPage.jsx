/**
 * @file Projects CRUD page — DataGrid + create/edit/archive/restore
 * @module nap-client/pages/Projects/ProjectsPage
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import { DataGrid } from '@mui/x-data-grid';

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useProjects, useCreateProject, useUpdateProject, useArchiveProject, useRestoreProject,
} from '../../hooks/useProjects.js';
import { pageContainerSx } from '../../config/layoutTokens.js';
import { deriveSelectionState } from '../../utils/selectionUtils.js';

const BLANK_CREATE = { project_code: '', name: '', description: '', notes: '', contract_amount: '' };
const BLANK_EDIT = { project_code: '', name: '', description: '', notes: '', contract_amount: '' };

const STATUS_MAP = { planning: 'active', budgeting: 'active', released: 'active', complete: 'suspended' };

const columns = [
  { field: 'project_code', headerName: 'Code', width: 130 },
  { field: 'name', headerName: 'Project Name', flex: 1, minWidth: 200 },
  {
    field: 'status',
    headerName: 'Status',
    width: 120,
    renderCell: ({ value }) => <StatusBadge status={STATUS_MAP[value] || 'active'} label={value} />,
  },
  { field: 'contract_amount', headerName: 'Contract Amount', width: 160, type: 'number' },
];

export default function ProjectsPage() {
  const navigate = useNavigate();
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
  const { selectedRows, selected, isSingle, hasSelection, allActive, allArchived } =
    deriveSelectionState(selectionModel, rows);

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
    setEditForm({
      project_code: selected.project_code ?? '',
      name: selected.name ?? '',
      description: selected.description ?? '',
      notes: selected.notes ?? '',
      contract_amount: selected.contract_amount ?? '',
    });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(createForm);
      toast('Project created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm });
      toast('Project updated');
      setEditOpen(false);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleArchive = async () => {
    try {
      const targets = selectedRows.filter((r) => !r.deactivated_at);
      for (const row of targets) await archiveMut.mutateAsync({ id: row.id });
      toast(targets.length === 1 ? 'Project archived' : `${targets.length} projects archived`);
      setArchiveOpen(false);
      setSelectionModel([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleRestore = async () => {
    try {
      const targets = selectedRows.filter((r) => !!r.deactivated_at);
      for (const row of targets) await restoreMut.mutateAsync({ id: row.id });
      toast(targets.length === 1 ? 'Project restored' : `${targets.length} projects restored`);
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
        { label: 'Create Project', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
        { label: 'Detail', variant: 'outlined', disabled: !isSingle, onClick: () => selected && navigate(`/projects/${selected.id}`) },
        { label: 'Edit', variant: 'outlined', disabled: !isSingle, onClick: openEdit },
        { label: selectedRows.length > 1 ? `Archive (${selectedRows.length})` : 'Archive', variant: 'outlined', color: 'error', disabled: !hasSelection || !allActive, onClick: () => setArchiveOpen(true) },
        { label: selectedRows.length > 1 ? `Restore (${selectedRows.length})` : 'Restore', variant: 'outlined', color: 'success', disabled: !hasSelection || !allArchived, onClick: () => setRestoreOpen(true) },
      ],
    }),
    [isSingle, hasSelection, allActive, allArchived, selectedRows.length, viewFilter, openEdit, navigate],
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
        rowSelectionModel={selectionModel}
        onRowSelectionModelChange={setSelectionModel}
        onRowDoubleClick={(p) => navigate(`/projects/${p.id}`)}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')}
      />

      <FormDialog open={createOpen} title="Create Project" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Project Code" required value={createForm.project_code} onChange={onCreateField('project_code')} inputProps={{ maxLength: 32 }} />
        <TextField label="Project Name" required value={createForm.name} onChange={onCreateField('name')} />
        <TextField label="Description" multiline minRows={2} value={createForm.description} onChange={onCreateField('description')} />
        <TextField label="Contract Amount" type="number" value={createForm.contract_amount} onChange={onCreateField('contract_amount')} />
        <TextField label="Notes" multiline minRows={2} value={createForm.notes} onChange={onCreateField('notes')} />
      </FormDialog>

      <FormDialog open={editOpen} title="Edit Project" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <TextField label="Project Code" required value={editForm.project_code} onChange={onEditField('project_code')} inputProps={{ maxLength: 32 }} />
        <TextField label="Project Name" required value={editForm.name} onChange={onEditField('name')} />
        <TextField label="Description" multiline minRows={2} value={editForm.description} onChange={onEditField('description')} />
        <TextField label="Contract Amount" type="number" value={editForm.contract_amount} onChange={onEditField('contract_amount')} />
        <TextField label="Notes" multiline minRows={2} value={editForm.notes} onChange={onEditField('notes')} />
      </FormDialog>

      <ConfirmDialog open={archiveOpen} title="Archive Project" message={hasSelection ? (selectedRows.length === 1 ? `Archive "${selectedRows[0].name}"? All units, tasks, and cost items will also be archived.` : `Archive ${selectedRows.length} projects? All units, tasks, and cost items will also be archived.`) : ''} confirmLabel="Archive" confirmColor="error" loading={archiveMut.isPending} onConfirm={handleArchive} onCancel={() => setArchiveOpen(false)} />
      <ConfirmDialog open={restoreOpen} title="Restore Project" message={hasSelection ? (selectedRows.length === 1 ? `Restore "${selectedRows[0].name}"?` : `Restore ${selectedRows.length} projects?`) : ''} confirmLabel="Restore" confirmColor="success" loading={restoreMut.isPending} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
