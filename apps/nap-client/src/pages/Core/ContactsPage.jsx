/**
 * @file Contacts CRUD page — DataGrid + create/edit/archive/restore
 * @module nap-client/pages/Core/ContactsPage
 *
 * Contacts are linked to vendors/clients/employees via source_id.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import { DataGrid } from '@mui/x-data-grid';

import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useContacts, useCreateContact, useUpdateContact, useArchiveContact, useRestoreContact,
} from '../../hooks/useContacts.js';
import { pageContainerSx } from '../../config/layoutTokens.js';
import { buildBulkActions } from '../../utils/selectionUtils.js';
import { useDataGridSelection } from '../../hooks/useDataGridSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const BLANK_CREATE = { source_id: '', name: '', email: '', phone: '', mobile: '', fax: '', position: '', is_primary: false };
const BLANK_EDIT = { name: '', email: '', phone: '', mobile: '', fax: '', position: '', is_primary: false };

const columns = [
  { field: 'name', headerName: 'Contact Name', flex: 1, minWidth: 180 },
  { field: 'email', headerName: 'Email', width: 200 },
  { field: 'phone', headerName: 'Phone', width: 140 },
  { field: 'mobile', headerName: 'Mobile', width: 140 },
  { field: 'position', headerName: 'Position', width: 140 },
  {
    field: 'is_primary',
    headerName: 'Primary',
    width: 90,
    valueGetter: (params) => (params.row.is_primary ? 'Yes' : 'No'),
  },
];

export default function ContactsPage() {
  const { data: res, isLoading } = useContacts();
  const allRows = res?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateContact();
  const updateMut = useUpdateContact();
  const archiveMut = useArchiveContact();
  const restoreMut = useRestoreContact();

  const { selectionModel, setSelectionModel, onSelectionChange, selectedRows, selected, isSingle, hasSelection, allActive, allArchived } =
    useDataGridSelection(rows);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

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
      name: selected.name ?? '',
      email: selected.email ?? '',
      phone: selected.phone ?? '',
      mobile: selected.mobile ?? '',
      fax: selected.fax ?? '',
      position: selected.position ?? '',
      is_primary: !!selected.is_primary,
    });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(createForm);
      toast('Contact created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm });
      toast('Contact updated');
      setEditOpen(false);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const { setArchiveOpen, setRestoreOpen, archiveConfirmProps, restoreConfirmProps } = useArchiveRestore({
    selectedRows, archiveMut, restoreMut, entityName: 'contact', setSelectionModel, toast, errMsg,
  });

  const toolbar = useMemo(
    () => ({
      tabs: [
        { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
        { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
        { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
      ],
      filters: [],
      primaryActions: [
        { label: 'Create Contact', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
        { label: 'Edit', variant: 'outlined', disabled: !isSingle, onClick: openEdit },
        ...buildBulkActions({ selectedRows, hasSelection, allActive, allArchived, onArchive: () => setArchiveOpen(true), onRestore: () => setRestoreOpen(true) }),
      ],
    }),
    [isSingle, hasSelection, allActive, allArchived, selectedRows.length, viewFilter, openEdit, setSelectionModel, setArchiveOpen, setRestoreOpen],
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
        onRowSelectionModelChange={onSelectionChange}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')}
      />

      <FormDialog open={createOpen} title="Create Contact" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Source ID" required value={createForm.source_id} onChange={onCreateField('source_id')} helperText="UUID of the vendor, client, or employee source" />
        <TextField label="Contact Name" required value={createForm.name} onChange={onCreateField('name')} />
        <TextField label="Email" type="email" value={createForm.email} onChange={onCreateField('email')} />
        <TextField label="Phone" value={createForm.phone} onChange={onCreateField('phone')} />
        <TextField label="Mobile" value={createForm.mobile} onChange={onCreateField('mobile')} />
        <TextField label="Fax" value={createForm.fax} onChange={onCreateField('fax')} />
        <TextField label="Position" value={createForm.position} onChange={onCreateField('position')} />
        <FormControlLabel control={<Checkbox checked={createForm.is_primary} onChange={onCreateCheck('is_primary')} />} label="Primary Contact" />
      </FormDialog>

      <FormDialog open={editOpen} title="Edit Contact" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <TextField label="Contact Name" required value={editForm.name} onChange={onEditField('name')} />
        <TextField label="Email" type="email" value={editForm.email} onChange={onEditField('email')} />
        <TextField label="Phone" value={editForm.phone} onChange={onEditField('phone')} />
        <TextField label="Mobile" value={editForm.mobile} onChange={onEditField('mobile')} />
        <TextField label="Fax" value={editForm.fax} onChange={onEditField('fax')} />
        <TextField label="Position" value={editForm.position} onChange={onEditField('position')} />
        <FormControlLabel control={<Checkbox checked={editForm.is_primary} onChange={onEditCheck('is_primary')} />} label="Primary Contact" />
      </FormDialog>

      <ConfirmDialog {...archiveConfirmProps} />
      <ConfirmDialog {...restoreConfirmProps} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
