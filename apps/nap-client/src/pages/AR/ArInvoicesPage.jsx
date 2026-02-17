/**
 * @file AR Invoices CRUD page — DataGrid + create/edit/archive/restore
 * @module nap-client/pages/AR/ArInvoicesPage
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
import { useArInvoices, useCreateArInvoice, useUpdateArInvoice, useArchiveArInvoice, useRestoreArInvoice } from '../../hooks/useAr.js';
import { useArClients } from '../../hooks/useAr.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const STATUS_OPTS = ['draft', 'sent', 'paid', 'voided'];
const cap = (s) => (s ? s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '');
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

const BLANK_CREATE = { client_id: '', invoice_number: '', invoice_date: '', due_date: '', total_amount: '', status: 'draft', notes: '' };
const BLANK_EDIT = { invoice_number: '', invoice_date: '', due_date: '', total_amount: '', balance_due: '', status: 'draft', notes: '' };

const columns = [
  { field: 'invoice_number', headerName: 'Invoice #', width: 140 },
  { field: 'client_id', headerName: 'Client', width: 120, valueGetter: (params) => params.row.client_id?.slice(0, 8) ?? '\u2014' },
  { field: 'invoice_date', headerName: 'Date', width: 120, valueGetter: (params) => fmtDate(params.row.invoice_date) },
  { field: 'due_date', headerName: 'Due', width: 120, valueGetter: (params) => fmtDate(params.row.due_date) },
  { field: 'total_amount', headerName: 'Total', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'balance_due', headerName: 'Balance', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusBadge status={value} /> },
];

export default function ArInvoicesPage() {
  const { data: res, isLoading } = useArInvoices();
  const allRows = res?.rows ?? [];

  const { data: clientRes } = useArClients({ limit: 500 });
  const clients = clientRes?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateArInvoice();
  const updateMut = useUpdateArInvoice();
  const archiveMut = useArchiveArInvoice();
  const restoreMut = useRestoreArInvoice();

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
    setEditForm({ invoice_number: selected.invoice_number ?? '', invoice_date: selected.invoice_date?.slice(0, 10) ?? '', due_date: selected.due_date?.slice(0, 10) ?? '', total_amount: selected.total_amount ?? '', balance_due: selected.balance_due ?? '', status: selected.status ?? 'draft', notes: selected.notes ?? '' });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => { try { await createMut.mutateAsync({ ...createForm, total_amount: Number(createForm.total_amount) || 0, balance_due: Number(createForm.total_amount) || 0 }); toast('Invoice created'); setCreateOpen(false); setCreateForm(BLANK_CREATE); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleUpdate = async () => { try { await updateMut.mutateAsync({ filter: { id: selected.id }, changes: { ...editForm, total_amount: Number(editForm.total_amount) || 0, balance_due: Number(editForm.balance_due) || 0 } }); toast('Invoice updated'); setEditOpen(false); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleArchive = async () => { try { await archiveMut.mutateAsync({ id: selected.id }); toast('Invoice archived'); setArchiveOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleRestore = async () => { try { await restoreMut.mutateAsync({ id: selected.id }); toast('Invoice restored'); setRestoreOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };

  const toolbar = useMemo(() => ({
    tabs: [
      { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
      { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
      { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
    ],
    filters: [],
    primaryActions: [
      { label: 'Create Invoice', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
      { label: 'Edit', variant: 'outlined', disabled: !selected, onClick: openEdit },
      { label: 'Archive', variant: 'outlined', color: 'error', disabled: !selected || isArchived, onClick: () => setArchiveOpen(true) },
      { label: 'Restore', variant: 'outlined', color: 'success', disabled: !selected || !isArchived, onClick: () => setRestoreOpen(true) },
    ],
  }), [selected, isArchived, viewFilter, openEdit]);
  useModuleToolbarRegistration(toolbar);

  return (
    <Box sx={pageContainerSx}>
      <DataGrid rows={rows} columns={columns} getRowId={(r) => r.id} loading={isLoading} checkboxSelection disableMultipleRowSelection rowSelectionModel={selectionModel} onRowSelectionModelChange={setSelectionModel} pageSizeOptions={[25, 50, 100]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')} />

      <FormDialog open={createOpen} title="Create AR Invoice" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Client" select required value={createForm.client_id} onChange={onCreateField('client_id')}>
          {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.client_code ? `${c.client_code} — ${c.name}` : c.name}</MenuItem>)}
        </TextField>
        <TextField label="Invoice Number" required value={createForm.invoice_number} onChange={onCreateField('invoice_number')} />
        <TextField label="Invoice Date" type="date" required value={createForm.invoice_date} onChange={onCreateField('invoice_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Due Date" type="date" value={createForm.due_date} onChange={onCreateField('due_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Total Amount" type="number" required value={createForm.total_amount} onChange={onCreateField('total_amount')} />
        <TextField label="Status" select value={createForm.status} onChange={onCreateField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Notes" multiline minRows={2} value={createForm.notes} onChange={onCreateField('notes')} />
      </FormDialog>

      <FormDialog open={editOpen} title="Edit AR Invoice" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <TextField label="Invoice Number" value={editForm.invoice_number} onChange={onEditField('invoice_number')} />
        <TextField label="Invoice Date" type="date" value={editForm.invoice_date} onChange={onEditField('invoice_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Due Date" type="date" value={editForm.due_date} onChange={onEditField('due_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Total Amount" type="number" value={editForm.total_amount} onChange={onEditField('total_amount')} />
        <TextField label="Balance Due" type="number" value={editForm.balance_due} onChange={onEditField('balance_due')} />
        <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Notes" multiline minRows={2} value={editForm.notes} onChange={onEditField('notes')} />
      </FormDialog>

      <ConfirmDialog open={archiveOpen} title="Archive Invoice" message={selected ? `Archive invoice "${selected.invoice_number}"?` : ''} confirmLabel="Archive" confirmColor="error" loading={archiveMut.isPending} onConfirm={handleArchive} onCancel={() => setArchiveOpen(false)} />
      <ConfirmDialog open={restoreOpen} title="Restore Invoice" message={selected ? `Restore invoice "${selected.invoice_number}"?` : ''} confirmLabel="Restore" confirmColor="success" loading={restoreMut.isPending} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
