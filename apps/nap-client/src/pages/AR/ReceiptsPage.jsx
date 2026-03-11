/**
 * @file Receipts CRUD page — DataTable + create/edit/view/archive/restore
 * @module nap-client/pages/AR/ReceiptsPage
 *
 * No ar_clients — PRD removed ar_clients table.
 * Receipts reference the unified clients table from core entities.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import CurrencyCell from '../../components/shared/CurrencyCell.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import DataTable from '../../components/shared/DataTable.jsx';
import FieldRow from '../../components/shared/FieldRow.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import { useReceipts, useCreateReceipt, useUpdateReceipt, useArchiveReceipt, useRestoreReceipt } from '../../hooks/useAr.js';
import { useClients } from '../../hooks/useClients.js';
import { pageContainerSx, dialogHeaderSx, dialogActionBoxSx, detailGridSx } from '../../config/layoutTokens.js';
import { useListSelection } from '../../hooks/useListSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const METHOD_OPTS = ['check', 'ach', 'wire'];
const cap = (s) => (s ? s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '');
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

const BLANK_CREATE = { client_id: '', ar_invoice_id: '', receipt_date: '', amount: '', method: 'check', reference: '', notes: '' };
const BLANK_EDIT = { receipt_date: '', amount: '', method: 'check', reference: '', notes: '' };

const columns = [
  { field: 'id', headerName: 'ID', width: 100, valueGetter: (params) => params.row.id?.slice(0, 8) },
  { field: 'client_id', headerName: 'Client', width: 120, valueGetter: (params) => params.row.client_id?.slice(0, 8) ?? '\u2014' },
  { field: 'receipt_date', headerName: 'Date', width: 120, valueGetter: (params) => fmtDate(params.row.receipt_date) },
  { field: 'amount', headerName: 'Amount', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'method', headerName: 'Method', width: 120, valueGetter: (params) => cap(params.row.method) },
  { field: 'reference', headerName: 'Reference', flex: 1, minWidth: 160 },
];

export default function ReceiptsPage() {
  const { data: res, isLoading } = useReceipts();
  const allRows = res?.rows ?? [];

  const { data: clientRes } = useClients({ limit: 500 });
  const clients = clientRes?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateReceipt();
  const updateMut = useUpdateReceipt();
  const archiveMut = useArchiveReceipt();
  const restoreMut = useRestoreReceipt();

  /* ── Selection (new system) ─────────────────────────────────── */
  const selection = useListSelection(rows);
  const { selectedRows, allActive, allArchived } = selection;

  /* ── Dialog state ───────────────────────────────────────────── */
  const [viewOpen, setViewOpen] = useState(false);
  const [viewReceipt, setViewReceipt] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);

  const [createForm, setCreateForm] = useState(BLANK_CREATE);
  const [editForm, setEditForm] = useState(BLANK_EDIT);

  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  const onCreateField = (f) => (e) => setCreateForm((p) => ({ ...p, [f]: e.target.value }));
  const onEditField = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.value }));

  /* ── Row action callbacks ──────────────────────────────────── */
  const handleView = useCallback((row) => {
    setViewReceipt(row);
    setViewOpen(true);
  }, []);

  const handleEdit = useCallback((row) => {
    setEditRow(row);
    setEditForm({
      receipt_date: row.receipt_date?.slice(0, 10) ?? '', amount: row.amount ?? '',
      method: row.method ?? 'check', reference: row.reference ?? '', notes: row.notes ?? '',
    });
    setEditOpen(true);
  }, []);

  const handleCreate = async () => {
    try { await createMut.mutateAsync({ ...createForm, amount: Number(createForm.amount) || 0 }); toast('Receipt created'); setCreateOpen(false); setCreateForm(BLANK_CREATE); } catch (err) { toast(errMsg(err), 'error'); }
  };
  const handleUpdate = async () => {
    try { await updateMut.mutateAsync({ filter: { id: editRow.id }, changes: { ...editForm, amount: Number(editForm.amount) || 0 } }); toast('Receipt updated'); setEditOpen(false); setEditRow(null); } catch (err) { toast(errMsg(err), 'error'); }
  };

  const { setArchiveOpen, setRestoreOpen, archiveConfirmProps, restoreConfirmProps } = useArchiveRestore({
    selectedRows, archiveMut, restoreMut, entityName: 'receipt', setSelectionModel: () => selection.clearSelection(), toast, errMsg,
  });

  /* ── ModuleBar: tabs + Archive/Restore + Create ────────────── */
  const toolbar = useMemo(() => {
    const primary = [];

    if (viewFilter === 'active' || viewFilter === 'all') {
      primary.push({
        label: selectedRows.length > 1 ? `Archive (${selectedRows.length})` : 'Archive',
        variant: 'outlined',
        color: 'error',
        disabled: selectedRows.length === 0 || !allActive,
        onClick: () => setArchiveOpen(true),
      });
    }
    if (viewFilter === 'archived' || viewFilter === 'all') {
      primary.push({
        label: selectedRows.length > 1 ? `Restore (${selectedRows.length})` : 'Restore',
        variant: 'outlined',
        color: 'success',
        disabled: selectedRows.length === 0 || !allArchived,
        onClick: () => setRestoreOpen(true),
      });
    }

    primary.push({
      label: 'Record Receipt',
      variant: 'contained',
      color: 'primary',
      onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); },
    });

    return {
      tabs: [
        { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); selection.clearSelection(); } },
        { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); selection.clearSelection(); } },
        { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); selection.clearSelection(); } },
      ],
      filters: [],
      primaryActions: primary,
    };
  }, [viewFilter, selectedRows.length, allActive, allArchived, selection.clearSelection, setArchiveOpen, setRestoreOpen]);
  useModuleToolbarRegistration(toolbar);

  return (
    <Box sx={pageContainerSx}>
      <DataTable
        rows={rows}
        columns={columns}
        loading={isLoading}
        selection={selection}
        onView={handleView}
        onEdit={handleEdit}
      />

      {/* ── View Details Dialog ──────────────────────────────────── */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={dialogHeaderSx}>
          <Box>
            <span>Receipt Details</span>
            {viewReceipt && (
              <Typography variant="body2" color="text.secondary">
                {viewReceipt.reference || viewReceipt.id?.slice(0, 8)}
              </Typography>
            )}
          </Box>
          <Box sx={dialogActionBoxSx}>
            <Button size="small" color="inherit" onClick={() => setViewOpen(false)}>
              Close
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {viewReceipt && (
            <Box sx={detailGridSx}>
              <FieldRow label="Receipt Date" value={fmtDate(viewReceipt.receipt_date)} />
              <FieldRow label="Client" value={viewReceipt.client_id?.slice(0, 8) || '\u2014'} />
              <FieldRow label="Amount" value={viewReceipt.amount != null ? Number(viewReceipt.amount).toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : '\u2014'} />
              <FieldRow label="Method" value={cap(viewReceipt.method)} />
              <FieldRow label="Reference" value={viewReceipt.reference || '\u2014'} />
              <FieldRow label="Created" value={fmtDate(viewReceipt.created_at)} />
              <FieldRow label="Updated" value={fmtDate(viewReceipt.updated_at)} />
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Record Receipt Dialog ────────────────────────────────── */}
      <FormDialog open={createOpen} title="Record Receipt" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Client" select required value={createForm.client_id} onChange={onCreateField('client_id')}>
          {clients.map((c) => <MenuItem key={c.id} value={c.id}>{c.client_code ? `${c.client_code} \u2014 ${c.name}` : c.name}</MenuItem>)}
        </TextField>
        <TextField label="AR Invoice ID" value={createForm.ar_invoice_id} onChange={onCreateField('ar_invoice_id')} helperText="UUID of the AR invoice" />
        <TextField label="Receipt Date" type="date" required value={createForm.receipt_date} onChange={onCreateField('receipt_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Amount" type="number" required value={createForm.amount} onChange={onCreateField('amount')} />
        <TextField label="Method" select value={createForm.method} onChange={onCreateField('method')}>
          {METHOD_OPTS.map((m) => <MenuItem key={m} value={m}>{cap(m)}</MenuItem>)}
        </TextField>
        <TextField label="Reference" value={createForm.reference} onChange={onCreateField('reference')} />
        <TextField label="Notes" multiline minRows={2} value={createForm.notes} onChange={onCreateField('notes')} />
      </FormDialog>

      {/* ── Edit Receipt Dialog ──────────────────────────────────── */}
      <FormDialog open={editOpen} title="Edit Receipt" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => { setEditOpen(false); setEditRow(null); }}>
        <TextField label="Receipt Date" type="date" value={editForm.receipt_date} onChange={onEditField('receipt_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Amount" type="number" value={editForm.amount} onChange={onEditField('amount')} />
        <TextField label="Method" select value={editForm.method} onChange={onEditField('method')}>
          {METHOD_OPTS.map((m) => <MenuItem key={m} value={m}>{cap(m)}</MenuItem>)}
        </TextField>
        <TextField label="Reference" value={editForm.reference} onChange={onEditField('reference')} />
        <TextField label="Notes" multiline minRows={2} value={editForm.notes} onChange={onEditField('notes')} />
      </FormDialog>

      <ConfirmDialog {...archiveConfirmProps} />
      <ConfirmDialog {...restoreConfirmProps} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
