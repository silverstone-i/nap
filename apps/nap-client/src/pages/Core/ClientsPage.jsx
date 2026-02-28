/**
 * @file Clients CRUD page — DataGrid + create/edit/archive/restore
 * @module nap-client/pages/Core/ClientsPage
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
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
  useClients, useCreateClient, useUpdateClient, useArchiveClient, useRestoreClient,
} from '../../hooks/useClients.js';
import { pageContainerSx } from '../../config/layoutTokens.js';
import { deriveSelectionState } from '../../utils/selectionUtils.js';

const BLANK_CREATE = { name: '', code: '' };
const BLANK_EDIT = { name: '', code: '' };

const columns = [
  { field: 'code', headerName: 'Code', width: 120 },
  { field: 'name', headerName: 'Client Name', flex: 1, minWidth: 200 },
  {
    field: 'is_active',
    headerName: 'Active',
    width: 100,
    renderCell: ({ value }) => <StatusBadge status={value ? 'active' : 'suspended'} />,
  },
];

export default function ClientsPage() {
  const { data: res, isLoading } = useClients();
  const allRows = res?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateClient();
  const updateMut = useUpdateClient();
  const archiveMut = useArchiveClient();
  const restoreMut = useRestoreClient();

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
    setEditForm({ name: selected.name ?? '', code: selected.code ?? '' });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(createForm);
      toast('Client created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm });
      toast('Client updated');
      setEditOpen(false);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleArchive = async () => {
    try {
      const targets = selectedRows.filter((r) => !r.deactivated_at);
      for (const row of targets) await archiveMut.mutateAsync({ id: row.id });
      toast(targets.length === 1 ? 'Client archived' : `${targets.length} clients archived`);
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
      toast(targets.length === 1 ? 'Client restored' : `${targets.length} clients restored`);
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
        { label: 'Create Client', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
        { label: 'Edit', variant: 'outlined', disabled: !isSingle, onClick: openEdit },
        { label: selectedRows.length > 1 ? `Archive (${selectedRows.length})` : 'Archive', variant: 'outlined', color: 'error', disabled: !hasSelection || !allActive, onClick: () => setArchiveOpen(true) },
        { label: selectedRows.length > 1 ? `Restore (${selectedRows.length})` : 'Restore', variant: 'outlined', color: 'success', disabled: !hasSelection || !allArchived, onClick: () => setRestoreOpen(true) },
      ],
    }),
    [isSingle, hasSelection, allActive, allArchived, selectedRows.length, viewFilter, openEdit],
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
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')}
      />

      <FormDialog open={createOpen} title="Create Client" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Client Name" required value={createForm.name} onChange={onCreateField('name')} />
        <TextField label="Code" value={createForm.code} onChange={onCreateField('code')} inputProps={{ maxLength: 16 }} />
      </FormDialog>

      <FormDialog open={editOpen} title="Edit Client" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <TextField label="Client Name" required value={editForm.name} onChange={onEditField('name')} />
        <TextField label="Code" value={editForm.code} onChange={onEditField('code')} inputProps={{ maxLength: 16 }} />
      </FormDialog>

      <ConfirmDialog open={archiveOpen} title="Archive Client" message={hasSelection ? (selectedRows.length === 1 ? `Archive "${selectedRows[0].name}"?` : `Archive ${selectedRows.length} clients?`) : ''} confirmLabel="Archive" confirmColor="error" loading={archiveMut.isPending} onConfirm={handleArchive} onCancel={() => setArchiveOpen(false)} />
      <ConfirmDialog open={restoreOpen} title="Restore Client" message={hasSelection ? (selectedRows.length === 1 ? `Restore "${selectedRows[0].name}"?` : `Restore ${selectedRows.length} clients?`) : ''} confirmLabel="Restore" confirmColor="success" loading={restoreMut.isPending} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
