/**
 * @file Change Orders CRUD page — DataGrid + create/edit/archive/restore
 * @module nap-client/pages/Projects/ChangeOrdersPage
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
  useChangeOrders, useCreateChangeOrder, useUpdateChangeOrder, useArchiveChangeOrder, useRestoreChangeOrder,
} from '../../hooks/useProjects.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const STATUS_OPTS = ['draft', 'submitted', 'approved', 'rejected'];
const cap = (s) => (s ? s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '');

const BLANK_CREATE = { unit_id: '', co_number: '', title: '', reason: '', status: 'draft', total_amount: '' };
const BLANK_EDIT = { title: '', reason: '', status: 'draft', total_amount: '' };

const columns = [
  { field: 'co_number', headerName: 'CO #', width: 120 },
  { field: 'title', headerName: 'Title', flex: 1, minWidth: 200 },
  { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusBadge status={value} /> },
  { field: 'total_amount', headerName: 'Amount', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'unit_id', headerName: 'Unit', width: 120, valueGetter: (params) => params.row.unit_id?.slice(0, 8) ?? '\u2014' },
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
    setEditForm({ title: selected.title ?? '', reason: selected.reason ?? '', status: selected.status ?? 'draft', total_amount: selected.total_amount ?? '' });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => { try { await createMut.mutateAsync({ ...createForm, total_amount: Number(createForm.total_amount) || 0 }); toast('Change order created'); setCreateOpen(false); setCreateForm(BLANK_CREATE); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleUpdate = async () => { try { await updateMut.mutateAsync({ filter: { id: selected.id }, changes: { ...editForm, total_amount: Number(editForm.total_amount) || 0 } }); toast('Change order updated'); setEditOpen(false); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleArchive = async () => { try { await archiveMut.mutateAsync({ id: selected.id }); toast('Change order archived'); setArchiveOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleRestore = async () => { try { await restoreMut.mutateAsync({ id: selected.id }); toast('Change order restored'); setRestoreOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };

  const toolbar = useMemo(() => ({
    tabs: [
      { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
      { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
      { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
    ],
    filters: [],
    primaryActions: [
      { label: 'Create CO', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
      { label: 'Edit', variant: 'outlined', disabled: !selected, onClick: openEdit },
      { label: 'Archive', variant: 'outlined', color: 'error', disabled: !selected || isArchived, onClick: () => setArchiveOpen(true) },
      { label: 'Restore', variant: 'outlined', color: 'success', disabled: !selected || !isArchived, onClick: () => setRestoreOpen(true) },
    ],
  }), [selected, isArchived, viewFilter, openEdit]);
  useModuleToolbarRegistration(toolbar);

  return (
    <Box sx={pageContainerSx}>
      <DataGrid rows={rows} columns={columns} getRowId={(r) => r.id} loading={isLoading} checkboxSelection disableMultipleRowSelection rowSelectionModel={selectionModel} onRowSelectionModelChange={setSelectionModel} pageSizeOptions={[25, 50, 100]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')} />

      <FormDialog open={createOpen} title="Create Change Order" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Unit ID" required value={createForm.unit_id} onChange={onCreateField('unit_id')} helperText="UUID of the unit" />
        <TextField label="CO Number" required value={createForm.co_number} onChange={onCreateField('co_number')} inputProps={{ maxLength: 16 }} />
        <TextField label="Title" required value={createForm.title} onChange={onCreateField('title')} />
        <TextField label="Status" select value={createForm.status} onChange={onCreateField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Total Amount" type="number" value={createForm.total_amount} onChange={onCreateField('total_amount')} />
        <TextField label="Reason" multiline minRows={2} value={createForm.reason} onChange={onCreateField('reason')} />
      </FormDialog>

      <FormDialog open={editOpen} title="Edit Change Order" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        {selected && <TextField label="CO Number" value={selected.co_number} disabled />}
        <TextField label="Title" required value={editForm.title} onChange={onEditField('title')} />
        <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Total Amount" type="number" value={editForm.total_amount} onChange={onEditField('total_amount')} />
        <TextField label="Reason" multiline minRows={2} value={editForm.reason} onChange={onEditField('reason')} />
      </FormDialog>

      <ConfirmDialog open={archiveOpen} title="Archive CO" message={selected ? `Archive "${selected.title}" (${selected.co_number})?` : ''} confirmLabel="Archive" confirmColor="error" loading={archiveMut.isPending} onConfirm={handleArchive} onCancel={() => setArchiveOpen(false)} />
      <ConfirmDialog open={restoreOpen} title="Restore CO" message={selected ? `Restore "${selected.title}" (${selected.co_number})?` : ''} confirmLabel="Restore" confirmColor="success" loading={restoreMut.isPending} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
