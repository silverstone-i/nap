/**
 * @file Actual Costs CRUD page — DataGrid + create/edit/archive/restore
 * @module nap-client/pages/Activities/ActualCostsPage
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
import { useActualCosts, useCreateActualCost, useUpdateActualCost, useArchiveActualCost, useRestoreActualCost } from '../../hooks/useActivities.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const STATUS_OPTS = ['draft', 'submitted', 'approved', 'rejected'];
const cap = (s) => (s ? s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '');

const BLANK_CREATE = { project_id: '', activity_id: '', amount: '', currency: 'USD', reference: '', approval_status: 'draft', incurred_on: '' };
const BLANK_EDIT = { amount: '', reference: '', approval_status: 'draft', incurred_on: '' };

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

const columns = [
  { field: 'id', headerName: 'ID', width: 100, valueGetter: (params) => params.row.id?.slice(0, 8) },
  { field: 'project_id', headerName: 'Project', width: 120, valueGetter: (params) => params.row.project_id?.slice(0, 8) ?? '\u2014' },
  { field: 'amount', headerName: 'Amount', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'currency', headerName: 'Curr', width: 80 },
  { field: 'incurred_on', headerName: 'Incurred On', width: 130, valueGetter: (params) => fmtDate(params.row.incurred_on) },
  { field: 'approval_status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusBadge status={value} /> },
  { field: 'reference', headerName: 'Reference', flex: 1, minWidth: 160 },
];

export default function ActualCostsPage() {
  const { data: res, isLoading } = useActualCosts();
  const allRows = res?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateActualCost();
  const updateMut = useUpdateActualCost();
  const archiveMut = useArchiveActualCost();
  const restoreMut = useRestoreActualCost();

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
    setEditForm({ amount: selected.amount ?? '', reference: selected.reference ?? '', approval_status: selected.approval_status ?? 'draft', incurred_on: selected.incurred_on?.slice(0, 10) ?? '' });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => { try { await createMut.mutateAsync({ ...createForm, amount: Number(createForm.amount) || 0 }); toast('Actual cost created'); setCreateOpen(false); setCreateForm(BLANK_CREATE); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleUpdate = async () => { try { await updateMut.mutateAsync({ filter: { id: selected.id }, changes: { ...editForm, amount: Number(editForm.amount) || 0 } }); toast('Actual cost updated'); setEditOpen(false); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleArchive = async () => { try { await archiveMut.mutateAsync({ id: selected.id }); toast('Actual cost archived'); setArchiveOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleRestore = async () => { try { await restoreMut.mutateAsync({ id: selected.id }); toast('Actual cost restored'); setRestoreOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };

  const toolbar = useMemo(() => ({
    tabs: [
      { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
      { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
      { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
    ],
    filters: [],
    primaryActions: [
      { label: 'Record Cost', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
      { label: 'Edit', variant: 'outlined', disabled: !selected, onClick: openEdit },
      { label: 'Archive', variant: 'outlined', color: 'error', disabled: !selected || isArchived, onClick: () => setArchiveOpen(true) },
      { label: 'Restore', variant: 'outlined', color: 'success', disabled: !selected || !isArchived, onClick: () => setRestoreOpen(true) },
    ],
  }), [selected, isArchived, viewFilter, openEdit]);
  useModuleToolbarRegistration(toolbar);

  return (
    <Box sx={pageContainerSx}>
      <DataGrid rows={rows} columns={columns} getRowId={(r) => r.id} loading={isLoading} checkboxSelection disableMultipleRowSelection rowSelectionModel={selectionModel} onRowSelectionModelChange={setSelectionModel} pageSizeOptions={[25, 50, 100]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')} />

      <FormDialog open={createOpen} title="Record Actual Cost" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Project ID" required value={createForm.project_id} onChange={onCreateField('project_id')} helperText="UUID" />
        <TextField label="Activity ID" value={createForm.activity_id} onChange={onCreateField('activity_id')} helperText="UUID" />
        <TextField label="Amount" type="number" required value={createForm.amount} onChange={onCreateField('amount')} />
        <TextField label="Currency" value={createForm.currency} onChange={onCreateField('currency')} inputProps={{ maxLength: 3 }} />
        <TextField label="Incurred On" type="date" value={createForm.incurred_on} onChange={onCreateField('incurred_on')} InputLabelProps={{ shrink: true }} />
        <TextField label="Status" select value={createForm.approval_status} onChange={onCreateField('approval_status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Reference" multiline minRows={2} value={createForm.reference} onChange={onCreateField('reference')} />
      </FormDialog>

      <FormDialog open={editOpen} title="Edit Actual Cost" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <TextField label="Amount" type="number" required value={editForm.amount} onChange={onEditField('amount')} />
        <TextField label="Incurred On" type="date" value={editForm.incurred_on} onChange={onEditField('incurred_on')} InputLabelProps={{ shrink: true }} />
        <TextField label="Status" select value={editForm.approval_status} onChange={onEditField('approval_status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Reference" multiline minRows={2} value={editForm.reference} onChange={onEditField('reference')} />
      </FormDialog>

      <ConfirmDialog open={archiveOpen} title="Archive Cost" message="Archive this actual cost record?" confirmLabel="Archive" confirmColor="error" loading={archiveMut.isPending} onConfirm={handleArchive} onCancel={() => setArchiveOpen(false)} />
      <ConfirmDialog open={restoreOpen} title="Restore Cost" message="Restore this actual cost record?" confirmLabel="Restore" confirmColor="success" loading={restoreMut.isPending} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
