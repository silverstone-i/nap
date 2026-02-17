/**
 * @file Payments CRUD page — DataGrid + create/edit/archive/restore
 * @module nap-client/pages/AP/PaymentsPage
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

import CurrencyCell from '../../components/shared/CurrencyCell.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import { usePayments, useCreatePayment, useUpdatePayment, useArchivePayment, useRestorePayment } from '../../hooks/useAp.js';
import { useVendors } from '../../hooks/useVendors.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const METHOD_OPTS = ['check', 'ach', 'wire', 'credit_card', 'cash'];
const cap = (s) => (s ? s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '');
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

const BLANK_CREATE = { vendor_id: '', ap_invoice_id: '', payment_date: '', amount: '', method: 'check', reference_number: '', notes: '' };
const BLANK_EDIT = { payment_date: '', amount: '', method: 'check', reference_number: '', notes: '' };

const columns = [
  { field: 'id', headerName: 'ID', width: 100, valueGetter: (params) => params.row.id?.slice(0, 8) },
  { field: 'vendor_id', headerName: 'Vendor', width: 120, valueGetter: (params) => params.row.vendor_id?.slice(0, 8) ?? '\u2014' },
  { field: 'payment_date', headerName: 'Date', width: 120, valueGetter: (params) => fmtDate(params.row.payment_date) },
  { field: 'amount', headerName: 'Amount', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'method', headerName: 'Method', width: 120, valueGetter: (params) => cap(params.row.method) },
  { field: 'reference_number', headerName: 'Reference', flex: 1, minWidth: 160 },
];

export default function PaymentsPage() {
  const { data: res, isLoading } = usePayments();
  const allRows = res?.rows ?? [];

  const { data: vendorRes } = useVendors({ limit: 500 });
  const vendors = vendorRes?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreatePayment();
  const updateMut = useUpdatePayment();
  const archiveMut = useArchivePayment();
  const restoreMut = useRestorePayment();

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
    setEditForm({ payment_date: selected.payment_date?.slice(0, 10) ?? '', amount: selected.amount ?? '', method: selected.method ?? 'check', reference_number: selected.reference_number ?? '', notes: selected.notes ?? '' });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => { try { await createMut.mutateAsync({ ...createForm, amount: Number(createForm.amount) || 0 }); toast('Payment created'); setCreateOpen(false); setCreateForm(BLANK_CREATE); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleUpdate = async () => { try { await updateMut.mutateAsync({ filter: { id: selected.id }, changes: { ...editForm, amount: Number(editForm.amount) || 0 } }); toast('Payment updated'); setEditOpen(false); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleArchive = async () => { try { await archiveMut.mutateAsync({ id: selected.id }); toast('Payment archived'); setArchiveOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleRestore = async () => { try { await restoreMut.mutateAsync({ id: selected.id }); toast('Payment restored'); setRestoreOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };

  const toolbar = useMemo(() => ({
    tabs: [
      { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
      { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
      { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
    ],
    filters: [],
    primaryActions: [
      { label: 'Record Payment', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
      { label: 'Edit', variant: 'outlined', disabled: !selected, onClick: openEdit },
      { label: 'Archive', variant: 'outlined', color: 'error', disabled: !selected || isArchived, onClick: () => setArchiveOpen(true) },
      { label: 'Restore', variant: 'outlined', color: 'success', disabled: !selected || !isArchived, onClick: () => setRestoreOpen(true) },
    ],
  }), [selected, isArchived, viewFilter, openEdit]);
  useModuleToolbarRegistration(toolbar);

  return (
    <Box sx={pageContainerSx}>
      <DataGrid rows={rows} columns={columns} getRowId={(r) => r.id} loading={isLoading} checkboxSelection disableMultipleRowSelection rowSelectionModel={selectionModel} onRowSelectionModelChange={setSelectionModel} pageSizeOptions={[25, 50, 100]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')} />

      <FormDialog open={createOpen} title="Record Payment" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Vendor" select required value={createForm.vendor_id} onChange={onCreateField('vendor_id')}>
          {vendors.map((v) => <MenuItem key={v.id} value={v.id}>{v.code ? `${v.code} — ${v.name}` : v.name}</MenuItem>)}
        </TextField>
        <TextField label="AP Invoice ID" value={createForm.ap_invoice_id} onChange={onCreateField('ap_invoice_id')} helperText="UUID of the AP invoice" />
        <TextField label="Payment Date" type="date" required value={createForm.payment_date} onChange={onCreateField('payment_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Amount" type="number" required value={createForm.amount} onChange={onCreateField('amount')} />
        <TextField label="Method" select value={createForm.method} onChange={onCreateField('method')}>
          {METHOD_OPTS.map((m) => <MenuItem key={m} value={m}>{cap(m)}</MenuItem>)}
        </TextField>
        <TextField label="Reference #" value={createForm.reference_number} onChange={onCreateField('reference_number')} />
        <TextField label="Notes" multiline minRows={2} value={createForm.notes} onChange={onCreateField('notes')} />
      </FormDialog>

      <FormDialog open={editOpen} title="Edit Payment" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <TextField label="Payment Date" type="date" value={editForm.payment_date} onChange={onEditField('payment_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Amount" type="number" value={editForm.amount} onChange={onEditField('amount')} />
        <TextField label="Method" select value={editForm.method} onChange={onEditField('method')}>
          {METHOD_OPTS.map((m) => <MenuItem key={m} value={m}>{cap(m)}</MenuItem>)}
        </TextField>
        <TextField label="Reference #" value={editForm.reference_number} onChange={onEditField('reference_number')} />
        <TextField label="Notes" multiline minRows={2} value={editForm.notes} onChange={onEditField('notes')} />
      </FormDialog>

      <ConfirmDialog open={archiveOpen} title="Archive Payment" message="Archive this payment record?" confirmLabel="Archive" confirmColor="error" loading={archiveMut.isPending} onConfirm={handleArchive} onCancel={() => setArchiveOpen(false)} />
      <ConfirmDialog open={restoreOpen} title="Restore Payment" message="Restore this payment record?" confirmLabel="Restore" confirmColor="success" loading={restoreMut.isPending} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
