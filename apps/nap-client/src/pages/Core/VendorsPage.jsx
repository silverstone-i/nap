/**
 * @file Vendors CRUD page — DataGrid + create/edit/archive/restore
 * @module nap-client/pages/Core/VendorsPage
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
  useVendors, useCreateVendor, useUpdateVendor, useArchiveVendor, useRestoreVendor,
} from '../../hooks/useVendors.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const BLANK_CREATE = { name: '', code: '', tax_id: '', payment_terms: '', notes: '' };
const BLANK_EDIT = { name: '', code: '', tax_id: '', payment_terms: '', notes: '' };

const columns = [
  { field: 'code', headerName: 'Code', width: 120 },
  { field: 'name', headerName: 'Vendor Name', flex: 1, minWidth: 200 },
  { field: 'tax_id', headerName: 'Tax ID', width: 140 },
  { field: 'payment_terms', headerName: 'Terms', width: 130 },
  {
    field: 'is_active',
    headerName: 'Active',
    width: 100,
    renderCell: ({ value }) => <StatusBadge status={value ? 'active' : 'suspended'} />,
  },
];

export default function VendorsPage() {
  const { data: res, isLoading } = useVendors();
  const allRows = res?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateVendor();
  const updateMut = useUpdateVendor();
  const archiveMut = useArchiveVendor();
  const restoreMut = useRestoreVendor();

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
    setEditForm({ name: selected.name ?? '', code: selected.code ?? '', tax_id: selected.tax_id ?? '', payment_terms: selected.payment_terms ?? '', notes: selected.notes ?? '' });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => { try { await createMut.mutateAsync(createForm); toast('Vendor created'); setCreateOpen(false); setCreateForm(BLANK_CREATE); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleUpdate = async () => { try { await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm }); toast('Vendor updated'); setEditOpen(false); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleArchive = async () => { try { await archiveMut.mutateAsync({ id: selected.id }); toast('Vendor archived'); setArchiveOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleRestore = async () => { try { await restoreMut.mutateAsync({ id: selected.id }); toast('Vendor restored'); setRestoreOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };

  const toolbar = useMemo(() => ({
    tabs: [
      { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
      { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
      { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
    ],
    filters: [],
    primaryActions: [
      { label: 'Create Vendor', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
      { label: 'Edit', variant: 'outlined', disabled: !selected, onClick: openEdit },
      { label: 'Archive', variant: 'outlined', color: 'error', disabled: !selected || isArchived, onClick: () => setArchiveOpen(true) },
      { label: 'Restore', variant: 'outlined', color: 'success', disabled: !selected || !isArchived, onClick: () => setRestoreOpen(true) },
    ],
  }), [selected, isArchived, viewFilter, openEdit]);
  useModuleToolbarRegistration(toolbar);

  return (
    <Box sx={pageContainerSx}>
      <DataGrid rows={rows} columns={columns} getRowId={(r) => r.id} loading={isLoading} checkboxSelection disableMultipleRowSelection rowSelectionModel={selectionModel} onRowSelectionModelChange={setSelectionModel} pageSizeOptions={[25, 50, 100]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')} />

      <FormDialog open={createOpen} title="Create Vendor" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Vendor Name" required value={createForm.name} onChange={onCreateField('name')} />
        <TextField label="Code" value={createForm.code} onChange={onCreateField('code')} inputProps={{ maxLength: 16 }} />
        <TextField label="Tax ID" value={createForm.tax_id} onChange={onCreateField('tax_id')} />
        <TextField label="Payment Terms" value={createForm.payment_terms} onChange={onCreateField('payment_terms')} />
        <TextField label="Notes" multiline minRows={2} value={createForm.notes} onChange={onCreateField('notes')} />
      </FormDialog>

      <FormDialog open={editOpen} title="Edit Vendor" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <TextField label="Vendor Name" required value={editForm.name} onChange={onEditField('name')} />
        <TextField label="Code" value={editForm.code} onChange={onEditField('code')} inputProps={{ maxLength: 16 }} />
        <TextField label="Tax ID" value={editForm.tax_id} onChange={onEditField('tax_id')} />
        <TextField label="Payment Terms" value={editForm.payment_terms} onChange={onEditField('payment_terms')} />
        <TextField label="Notes" multiline minRows={2} value={editForm.notes} onChange={onEditField('notes')} />
      </FormDialog>

      <ConfirmDialog open={archiveOpen} title="Archive Vendor" message={selected ? `Archive "${selected.name}"?` : ''} confirmLabel="Archive" confirmColor="error" loading={archiveMut.isPending} onConfirm={handleArchive} onCancel={() => setArchiveOpen(false)} />
      <ConfirmDialog open={restoreOpen} title="Restore Vendor" message={selected ? `Restore "${selected.name}"?` : ''} confirmLabel="Restore" confirmColor="success" loading={restoreMut.isPending} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
