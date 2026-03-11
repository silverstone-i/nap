/**
 * @file AP Invoices CRUD page — DataTable + create/edit/view/archive/restore
 * @module nap-client/pages/AP/ApInvoicesPage
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

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import CurrencyCell from '../../components/shared/CurrencyCell.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import DataTable from '../../components/shared/DataTable.jsx';
import FieldRow from '../../components/shared/FieldRow.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useApInvoices, useCreateApInvoice, useUpdateApInvoice, useArchiveApInvoice, useRestoreApInvoice,
} from '../../hooks/useAp.js';
import { useVendors } from '../../hooks/useVendors.js';
import { pageContainerSx } from '../../config/layoutTokens.js';
import { useListSelection } from '../../hooks/useListSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const STATUS_OPTS = ['open', 'approved', 'paid', 'voided'];
const cap = (s) => (s ? s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '');
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

const BLANK_CREATE = { vendor_id: '', invoice_number: '', invoice_date: '', due_date: '', total_amount: '', status: 'open', notes: '' };
const BLANK_EDIT = { invoice_number: '', invoice_date: '', due_date: '', total_amount: '', status: 'open', notes: '' };

const columns = [
  { field: 'invoice_number', headerName: 'Invoice #', width: 140 },
  { field: 'vendor_id', headerName: 'Vendor', width: 120, valueGetter: (params) => params.row.vendor_id?.slice(0, 8) ?? '\u2014' },
  { field: 'invoice_date', headerName: 'Date', width: 120, valueGetter: (params) => fmtDate(params.row.invoice_date) },
  { field: 'due_date', headerName: 'Due', width: 120, valueGetter: (params) => fmtDate(params.row.due_date) },
  { field: 'total_amount', headerName: 'Total', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusBadge status={value} /> },
];

const detailGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
  gap: 1.5,
};

export default function ApInvoicesPage() {
  const { data: res, isLoading } = useApInvoices();
  const allRows = res?.rows ?? [];

  const { data: vendorRes } = useVendors({ limit: 500 });
  const vendors = vendorRes?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateApInvoice();
  const updateMut = useUpdateApInvoice();
  const archiveMut = useArchiveApInvoice();
  const restoreMut = useRestoreApInvoice();

  /* ── Selection (new system) ─────────────────────────────────── */
  const selection = useListSelection(rows);
  const { selectedRows, allActive, allArchived } = selection;

  /* ── Dialog state ───────────────────────────────────────────── */
  const [viewOpen, setViewOpen] = useState(false);
  const [viewInvoice, setViewInvoice] = useState(null);
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
    setViewInvoice(row);
    setViewOpen(true);
  }, []);

  const handleEdit = useCallback((row) => {
    setEditRow(row);
    setEditForm({
      invoice_number: row.invoice_number ?? '', invoice_date: row.invoice_date?.slice(0, 10) ?? '',
      due_date: row.due_date?.slice(0, 10) ?? '', total_amount: row.total_amount ?? '',
      status: row.status ?? 'open', notes: row.notes ?? '',
    });
    setEditOpen(true);
  }, []);

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync({ ...createForm, total_amount: Number(createForm.total_amount) || 0 });
      toast('Invoice created'); setCreateOpen(false); setCreateForm(BLANK_CREATE);
    } catch (err) { toast(errMsg(err), 'error'); }
  };
  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: editRow.id }, changes: { ...editForm, total_amount: Number(editForm.total_amount) || 0 } });
      toast('Invoice updated'); setEditOpen(false); setEditRow(null);
    } catch (err) { toast(errMsg(err), 'error'); }
  };

  const { setArchiveOpen, setRestoreOpen, archiveConfirmProps, restoreConfirmProps } = useArchiveRestore({
    selectedRows, archiveMut, restoreMut, entityName: 'invoice', setSelectionModel: () => selection.clearSelection(), toast, errMsg, getLabel: (r) => r.invoice_number,
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
      label: 'Create Invoice',
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
        <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start' }}>
          <Box>
            <span>Invoice Details</span>
            {viewInvoice && (
              <Typography variant="body2" color="text.secondary">
                {viewInvoice.invoice_number}
              </Typography>
            )}
          </Box>
          <Box sx={{ ml: 'auto' }}>
            <Button size="small" color="inherit" onClick={() => setViewOpen(false)}>
              Close
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {viewInvoice && (
            <Box sx={detailGridSx}>
              <FieldRow label="Invoice Number" value={viewInvoice.invoice_number || '\u2014'} />
              <FieldRow label="Vendor" value={viewInvoice.vendor_id?.slice(0, 8) || '\u2014'} />
              <FieldRow label="Invoice Date" value={fmtDate(viewInvoice.invoice_date)} />
              <FieldRow label="Due Date" value={fmtDate(viewInvoice.due_date)} />
              <FieldRow label="Total Amount" value={viewInvoice.total_amount != null ? Number(viewInvoice.total_amount).toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : '\u2014'} />
              <FieldRow label="Status">
                <StatusBadge status={viewInvoice.status} />
              </FieldRow>
              <FieldRow label="Created" value={fmtDate(viewInvoice.created_at)} />
              <FieldRow label="Updated" value={fmtDate(viewInvoice.updated_at)} />
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create AP Invoice Dialog ─────────────────────────────── */}
      <FormDialog open={createOpen} title="Create AP Invoice" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Vendor" select required value={createForm.vendor_id} onChange={onCreateField('vendor_id')}>
          {vendors.map((v) => <MenuItem key={v.id} value={v.id}>{v.code ? `${v.code} \u2014 ${v.name}` : v.name}</MenuItem>)}
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

      {/* ── Edit AP Invoice Dialog ───────────────────────────────── */}
      <FormDialog open={editOpen} title="Edit AP Invoice" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => { setEditOpen(false); setEditRow(null); }}>
        <TextField label="Invoice Number" required value={editForm.invoice_number} onChange={onEditField('invoice_number')} />
        <TextField label="Invoice Date" type="date" value={editForm.invoice_date} onChange={onEditField('invoice_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Due Date" type="date" value={editForm.due_date} onChange={onEditField('due_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Total Amount" type="number" value={editForm.total_amount} onChange={onEditField('total_amount')} />
        <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
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
