/**
 * @file AR Clients CRUD page — DataGrid + create/edit/archive/restore
 * @module nap-client/pages/AR/ClientsPage
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
import { useArClients, useCreateArClient, useUpdateArClient, useArchiveArClient, useRestoreArClient } from '../../hooks/useAr.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const BLANK_CREATE = { client_code: '', name: '', email: '', phone: '', tax_id: '', notes: '' };
const BLANK_EDIT = { name: '', email: '', phone: '', tax_id: '', notes: '' };

const columns = [
  { field: 'client_code', headerName: 'Code', width: 120 },
  { field: 'name', headerName: 'Client Name', flex: 1, minWidth: 200 },
  { field: 'email', headerName: 'Email', width: 200 },
  { field: 'phone', headerName: 'Phone', width: 140 },
  {
    field: 'is_active',
    headerName: 'Active',
    width: 100,
    renderCell: ({ value }) => <StatusBadge status={value ? 'active' : 'suspended'} />,
  },
];

export default function ClientsPage() {
  const { data: res, isLoading } = useArClients();
  const allRows = res?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateArClient();
  const updateMut = useUpdateArClient();
  const archiveMut = useArchiveArClient();
  const restoreMut = useRestoreArClient();

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
    setEditForm({ name: selected.name ?? '', email: selected.email ?? '', phone: selected.phone ?? '', tax_id: selected.tax_id ?? '', notes: selected.notes ?? '' });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => { try { await createMut.mutateAsync(createForm); toast('Client created'); setCreateOpen(false); setCreateForm(BLANK_CREATE); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleUpdate = async () => { try { await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm }); toast('Client updated'); setEditOpen(false); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleArchive = async () => { try { await archiveMut.mutateAsync({ id: selected.id }); toast('Client archived'); setArchiveOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleRestore = async () => { try { await restoreMut.mutateAsync({ id: selected.id }); toast('Client restored'); setRestoreOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };

  const toolbar = useMemo(() => ({
    tabs: [
      { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
      { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
      { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
    ],
    filters: [],
    primaryActions: [
      { label: 'Create Client', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
      { label: 'Edit', variant: 'outlined', disabled: !selected, onClick: openEdit },
      { label: 'Archive', variant: 'outlined', color: 'error', disabled: !selected || isArchived, onClick: () => setArchiveOpen(true) },
      { label: 'Restore', variant: 'outlined', color: 'success', disabled: !selected || !isArchived, onClick: () => setRestoreOpen(true) },
    ],
  }), [selected, isArchived, viewFilter, openEdit]);
  useModuleToolbarRegistration(toolbar);

  return (
    <Box sx={pageContainerSx}>
      <DataGrid rows={rows} columns={columns} getRowId={(r) => r.id} loading={isLoading} checkboxSelection disableMultipleRowSelection rowSelectionModel={selectionModel} onRowSelectionModelChange={setSelectionModel} pageSizeOptions={[25, 50, 100]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')} />

      <FormDialog open={createOpen} title="Create Client" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Client Code" required value={createForm.client_code} onChange={onCreateField('client_code')} inputProps={{ maxLength: 12 }} />
        <TextField label="Client Name" required value={createForm.name} onChange={onCreateField('name')} />
        <TextField label="Email" type="email" value={createForm.email} onChange={onCreateField('email')} />
        <TextField label="Phone" value={createForm.phone} onChange={onCreateField('phone')} />
        <TextField label="Tax ID" value={createForm.tax_id} onChange={onCreateField('tax_id')} />
        <TextField label="Notes" multiline minRows={2} value={createForm.notes} onChange={onCreateField('notes')} />
      </FormDialog>

      <FormDialog open={editOpen} title="Edit Client" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        {selected && <TextField label="Client Code" value={selected.client_code} disabled />}
        <TextField label="Client Name" required value={editForm.name} onChange={onEditField('name')} />
        <TextField label="Email" type="email" value={editForm.email} onChange={onEditField('email')} />
        <TextField label="Phone" value={editForm.phone} onChange={onEditField('phone')} />
        <TextField label="Tax ID" value={editForm.tax_id} onChange={onEditField('tax_id')} />
        <TextField label="Notes" multiline minRows={2} value={editForm.notes} onChange={onEditField('notes')} />
      </FormDialog>

      <ConfirmDialog open={archiveOpen} title="Archive Client" message={selected ? `Archive "${selected.name}" (${selected.client_code})?` : ''} confirmLabel="Archive" confirmColor="error" loading={archiveMut.isPending} onConfirm={handleArchive} onCancel={() => setArchiveOpen(false)} />
      <ConfirmDialog open={restoreOpen} title="Restore Client" message={selected ? `Restore "${selected.name}" (${selected.client_code})?` : ''} confirmLabel="Restore" confirmColor="success" loading={restoreMut.isPending} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
