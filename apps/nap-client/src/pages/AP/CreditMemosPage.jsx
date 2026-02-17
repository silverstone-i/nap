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

const STATUS_OPTS = ['open', 'applied', 'voided'];
const cap = (s) => (s ? s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '');
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

const BLANK_CREATE = { vendor_id: '', ap_invoice_id: '', memo_number: '', memo_date: '', amount: '', reason: '', status: 'open' };
const BLANK_EDIT = { memo_number: '', memo_date: '', amount: '', reason: '', status: 'open' };

const columns = [
  { field: 'memo_number', headerName: 'Memo #', width: 140 },
  { field: 'vendor_id', headerName: 'Vendor', width: 120, valueGetter: (params) => params.row.vendor_id?.slice(0, 8) ?? '\u2014' },
  { field: 'memo_date', headerName: 'Date', width: 120, valueGetter: (params) => fmtDate(params.row.memo_date) },
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
    setEditForm({ memo_number: selected.memo_number ?? '', memo_date: selected.memo_date?.slice(0, 10) ?? '', amount: selected.amount ?? '', reason: selected.reason ?? '', status: selected.status ?? 'open' });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => { try { await createMut.mutateAsync({ ...createForm, amount: Number(createForm.amount) || 0 }); toast('Credit memo created'); setCreateOpen(false); setCreateForm(BLANK_CREATE); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleUpdate = async () => { try { await updateMut.mutateAsync({ filter: { id: selected.id }, changes: { ...editForm, amount: Number(editForm.amount) || 0 } }); toast('Credit memo updated'); setEditOpen(false); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleArchive = async () => { try { await archiveMut.mutateAsync({ id: selected.id }); toast('Credit memo archived'); setArchiveOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleRestore = async () => { try { await restoreMut.mutateAsync({ id: selected.id }); toast('Credit memo restored'); setRestoreOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };

  const toolbar = useMemo(() => ({
    tabs: [
      { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
      { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
      { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
    ],
    filters: [],
    primaryActions: [
      { label: 'Create Memo', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
      { label: 'Edit', variant: 'outlined', disabled: !selected, onClick: openEdit },
      { label: 'Archive', variant: 'outlined', color: 'error', disabled: !selected || isArchived, onClick: () => setArchiveOpen(true) },
      { label: 'Restore', variant: 'outlined', color: 'success', disabled: !selected || !isArchived, onClick: () => setRestoreOpen(true) },
    ],
  }), [selected, isArchived, viewFilter, openEdit]);
  useModuleToolbarRegistration(toolbar);

  return (
    <Box sx={pageContainerSx}>
      <DataGrid rows={rows} columns={columns} getRowId={(r) => r.id} loading={isLoading} checkboxSelection disableMultipleRowSelection rowSelectionModel={selectionModel} onRowSelectionModelChange={setSelectionModel} pageSizeOptions={[25, 50, 100]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')} />

      <FormDialog open={createOpen} title="Create Credit Memo" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Vendor" select required value={createForm.vendor_id} onChange={onCreateField('vendor_id')}>
          {vendors.map((v) => <MenuItem key={v.id} value={v.id}>{v.code ? `${v.code} — ${v.name}` : v.name}</MenuItem>)}
        </TextField>
        <TextField label="AP Invoice ID" value={createForm.ap_invoice_id} onChange={onCreateField('ap_invoice_id')} helperText="UUID (optional)" />
        <TextField label="Memo Number" required value={createForm.memo_number} onChange={onCreateField('memo_number')} />
        <TextField label="Memo Date" type="date" required value={createForm.memo_date} onChange={onCreateField('memo_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Amount" type="number" required value={createForm.amount} onChange={onCreateField('amount')} />
        <TextField label="Status" select value={createForm.status} onChange={onCreateField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Reason" multiline minRows={2} value={createForm.reason} onChange={onCreateField('reason')} />
      </FormDialog>

      <FormDialog open={editOpen} title="Edit Credit Memo" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <TextField label="Memo Number" value={editForm.memo_number} onChange={onEditField('memo_number')} />
        <TextField label="Memo Date" type="date" value={editForm.memo_date} onChange={onEditField('memo_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Amount" type="number" value={editForm.amount} onChange={onEditField('amount')} />
        <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Reason" multiline minRows={2} value={editForm.reason} onChange={onEditField('reason')} />
      </FormDialog>

      <ConfirmDialog open={archiveOpen} title="Archive Memo" message={selected ? `Archive memo "${selected.memo_number}"?` : ''} confirmLabel="Archive" confirmColor="error" loading={archiveMut.isPending} onConfirm={handleArchive} onCancel={() => setArchiveOpen(false)} />
      <ConfirmDialog open={restoreOpen} title="Restore Memo" message={selected ? `Restore memo "${selected.memo_number}"?` : ''} confirmLabel="Restore" confirmColor="success" loading={restoreMut.isPending} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
