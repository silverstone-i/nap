/**
 * @file Change Orders CRUD page — DataGrid + create/edit/archive/restore
 * @module nap-client/pages/Projects/ChangeOrdersPage
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
  useChangeOrders, useCreateChangeOrder, useUpdateChangeOrder, useArchiveChangeOrder, useRestoreChangeOrder,
} from '../../hooks/useChangeOrders.js';
import { pageContainerSx } from '../../config/layoutTokens.js';
import { deriveSelectionState } from '../../utils/selectionUtils.js';

const BLANK_CREATE = { unit_id: '', co_number: '', title: '', reason: '', total_amount: '' };
const BLANK_EDIT = { co_number: '', title: '', reason: '', total_amount: '' };

const STATUS_MAP = { draft: 'active', submitted: 'active', approved: 'active', rejected: 'suspended' };

const columns = [
  { field: 'co_number', headerName: 'CO #', width: 120 },
  { field: 'title', headerName: 'Title', flex: 1, minWidth: 200 },
  {
    field: 'status',
    headerName: 'Status',
    width: 120,
    renderCell: ({ value }) => <StatusBadge status={STATUS_MAP[value] || 'active'} label={value} />,
  },
  { field: 'total_amount', headerName: 'Amount', width: 140, type: 'number' },
];

export default function ChangeOrdersPage() {
  const { data: res, isLoading } = useChangeOrders();
  const allRows = res?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateChangeOrder();
  const updateMut = useUpdateChangeOrder();
  const archiveMut = useArchiveChangeOrder();
  const restoreMut = useRestoreChangeOrder();

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
      co_number: selected.co_number ?? '',
      title: selected.title ?? '',
      reason: selected.reason ?? '',
      total_amount: selected.total_amount ?? '',
    });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(createForm);
      toast('Change order created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm });
      toast('Change order updated');
      setEditOpen(false);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleArchive = async () => {
    try {
      const targets = selectedRows.filter((r) => !r.deactivated_at);
      for (const row of targets) await archiveMut.mutateAsync({ id: row.id });
      toast(targets.length === 1 ? 'Change order archived' : `${targets.length} change orders archived`);
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
      toast(targets.length === 1 ? 'Change order restored' : `${targets.length} change orders restored`);
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
        { label: 'Create CO', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
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

      <FormDialog open={createOpen} title="Create Change Order" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Unit ID" required value={createForm.unit_id} onChange={onCreateField('unit_id')} helperText="UUID of the unit" />
        <TextField label="CO Number" required value={createForm.co_number} onChange={onCreateField('co_number')} inputProps={{ maxLength: 16 }} />
        <TextField label="Title" required value={createForm.title} onChange={onCreateField('title')} />
        <TextField label="Reason" multiline minRows={2} value={createForm.reason} onChange={onCreateField('reason')} />
        <TextField label="Total Amount" type="number" value={createForm.total_amount} onChange={onCreateField('total_amount')} />
      </FormDialog>

      <FormDialog open={editOpen} title="Edit Change Order" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <TextField label="CO Number" required value={editForm.co_number} onChange={onEditField('co_number')} inputProps={{ maxLength: 16 }} />
        <TextField label="Title" required value={editForm.title} onChange={onEditField('title')} />
        <TextField label="Reason" multiline minRows={2} value={editForm.reason} onChange={onEditField('reason')} />
        <TextField label="Total Amount" type="number" value={editForm.total_amount} onChange={onEditField('total_amount')} />
      </FormDialog>

      <ConfirmDialog open={archiveOpen} title="Archive Change Order" message={hasSelection ? (selectedRows.length === 1 ? `Archive "${selectedRows[0].title}"?` : `Archive ${selectedRows.length} change orders?`) : ''} confirmLabel="Archive" confirmColor="error" loading={archiveMut.isPending} onConfirm={handleArchive} onCancel={() => setArchiveOpen(false)} />
      <ConfirmDialog open={restoreOpen} title="Restore Change Order" message={hasSelection ? (selectedRows.length === 1 ? `Restore "${selectedRows[0].title}"?` : `Restore ${selectedRows.length} change orders?`) : ''} confirmLabel="Restore" confirmColor="success" loading={restoreMut.isPending} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
