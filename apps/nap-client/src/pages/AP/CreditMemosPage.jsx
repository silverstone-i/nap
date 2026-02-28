/**
 * @file AP Credit Memos CRUD page — DataGrid + create/edit/archive/restore
 * @module nap-client/pages/AP/CreditMemosPage
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
import { useApCreditMemos, useCreateApCreditMemo, useUpdateApCreditMemo, useArchiveApCreditMemo, useRestoreApCreditMemo } from '../../hooks/useAp.js';
import { useVendors } from '../../hooks/useVendors.js';
import { pageContainerSx } from '../../config/layoutTokens.js';
import { deriveSelectionState } from '../../utils/selectionUtils.js';

const STATUS_OPTS = ['open', 'applied', 'voided'];
const cap = (s) => (s ? s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '');
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

const BLANK_CREATE = { vendor_id: '', ap_invoice_id: '', credit_number: '', credit_date: '', amount: '', reason: '', status: 'open' };
const BLANK_EDIT = { credit_number: '', credit_date: '', amount: '', reason: '', status: 'open' };

const columns = [
  { field: 'credit_number', headerName: 'Credit #', width: 140 },
  { field: 'vendor_id', headerName: 'Vendor', width: 120, valueGetter: (params) => params.row.vendor_id?.slice(0, 8) ?? '\u2014' },
  { field: 'credit_date', headerName: 'Date', width: 120, valueGetter: (params) => fmtDate(params.row.credit_date) },
  { field: 'amount', headerName: 'Amount', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusBadge status={value} /> },
  { field: 'reason', headerName: 'Reason', flex: 1, minWidth: 180 },
];

export default function CreditMemosPage() {
  const { data: res, isLoading } = useApCreditMemos();
  const allRows = res?.rows ?? [];

  const { data: vendorRes } = useVendors({ limit: 500 });
  const vendors = vendorRes?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateApCreditMemo();
  const updateMut = useUpdateApCreditMemo();
  const archiveMut = useArchiveApCreditMemo();
  const restoreMut = useRestoreApCreditMemo();

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
      credit_number: selected.credit_number ?? '', credit_date: selected.credit_date?.slice(0, 10) ?? '',
      amount: selected.amount ?? '', reason: selected.reason ?? '', status: selected.status ?? 'open',
    });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => {
    try { await createMut.mutateAsync({ ...createForm, amount: Number(createForm.amount) || 0 }); toast('Credit memo created'); setCreateOpen(false); setCreateForm(BLANK_CREATE); } catch (err) { toast(errMsg(err), 'error'); }
  };
  const handleUpdate = async () => {
    try { await updateMut.mutateAsync({ filter: { id: selected.id }, changes: { ...editForm, amount: Number(editForm.amount) || 0 } }); toast('Credit memo updated'); setEditOpen(false); } catch (err) { toast(errMsg(err), 'error'); }
  };
  const handleArchive = async () => {
    try {
      const targets = selectedRows.filter((r) => !r.deactivated_at);
      for (const row of targets) await archiveMut.mutateAsync({ id: row.id });
      toast(targets.length === 1 ? 'Credit memo archived' : `${targets.length} credit memos archived`);
      setArchiveOpen(false); setSelectionModel([]);
    } catch (err) { toast(errMsg(err), 'error'); }
  };
  const handleRestore = async () => {
    try {
      const targets = selectedRows.filter((r) => !!r.deactivated_at);
      for (const row of targets) await restoreMut.mutateAsync({ id: row.id });
      toast(targets.length === 1 ? 'Credit memo restored' : `${targets.length} credit memos restored`);
      setRestoreOpen(false); setSelectionModel([]);
    } catch (err) { toast(errMsg(err), 'error'); }
  };

  const toolbar = useMemo(() => ({
    tabs: [
      { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
      { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
      { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
    ],
    filters: [],
    primaryActions: [
      { label: 'Create Memo', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
      { label: 'Edit', variant: 'outlined', disabled: !isSingle, onClick: openEdit },
      { label: selectedRows.length > 1 ? `Archive (${selectedRows.length})` : 'Archive', variant: 'outlined', color: 'error', disabled: !hasSelection || !allActive, onClick: () => setArchiveOpen(true) },
      { label: selectedRows.length > 1 ? `Restore (${selectedRows.length})` : 'Restore', variant: 'outlined', color: 'success', disabled: !hasSelection || !allArchived, onClick: () => setRestoreOpen(true) },
    ],
  }), [selected, isSingle, hasSelection, allActive, allArchived, selectedRows.length, viewFilter, openEdit]);
  useModuleToolbarRegistration(toolbar);

  return (
    <Box sx={pageContainerSx}>
      <DataGrid rows={rows} columns={columns} getRowId={(r) => r.id} loading={isLoading} checkboxSelection rowSelectionModel={selectionModel} onRowSelectionModelChange={setSelectionModel} pageSizeOptions={[25, 50, 100]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')} />

      <FormDialog open={createOpen} title="Create Credit Memo" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Vendor" select required value={createForm.vendor_id} onChange={onCreateField('vendor_id')}>
          {vendors.map((v) => <MenuItem key={v.id} value={v.id}>{v.code ? `${v.code} \u2014 ${v.name}` : v.name}</MenuItem>)}
        </TextField>
        <TextField label="AP Invoice ID" value={createForm.ap_invoice_id} onChange={onCreateField('ap_invoice_id')} helperText="UUID (optional)" />
        <TextField label="Credit Number" required value={createForm.credit_number} onChange={onCreateField('credit_number')} />
        <TextField label="Credit Date" type="date" required value={createForm.credit_date} onChange={onCreateField('credit_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Amount" type="number" required value={createForm.amount} onChange={onCreateField('amount')} />
        <TextField label="Status" select value={createForm.status} onChange={onCreateField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Reason" multiline minRows={2} value={createForm.reason} onChange={onCreateField('reason')} />
      </FormDialog>

      <FormDialog open={editOpen} title="Edit Credit Memo" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <TextField label="Credit Number" value={editForm.credit_number} onChange={onEditField('credit_number')} />
        <TextField label="Credit Date" type="date" value={editForm.credit_date} onChange={onEditField('credit_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Amount" type="number" value={editForm.amount} onChange={onEditField('amount')} />
        <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Reason" multiline minRows={2} value={editForm.reason} onChange={onEditField('reason')} />
      </FormDialog>

      <ConfirmDialog open={archiveOpen} title="Archive Memo" message={hasSelection ? (selectedRows.length === 1 ? `Archive memo "${selectedRows[0].credit_number}"?` : `Archive ${selectedRows.length} credit memos?`) : ''} confirmLabel="Archive" confirmColor="error" loading={archiveMut.isPending} onConfirm={handleArchive} onCancel={() => setArchiveOpen(false)} />
      <ConfirmDialog open={restoreOpen} title="Restore Memo" message={hasSelection ? (selectedRows.length === 1 ? `Restore memo "${selectedRows[0].credit_number}"?` : `Restore ${selectedRows.length} credit memos?`) : ''} confirmLabel="Restore" confirmColor="success" loading={restoreMut.isPending} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
