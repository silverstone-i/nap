/**
 * @file AP Credit Memos CRUD page — DataTable + create/edit/view/archive/restore
 * @module nap-client/pages/AP/CreditMemosPage
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
import { useApCreditMemos, useCreateApCreditMemo, useUpdateApCreditMemo, useArchiveApCreditMemo, useRestoreApCreditMemo } from '../../hooks/useAp.js';
import { useVendors } from '../../hooks/useVendors.js';
import { pageContainerSx, dialogHeaderSx, dialogActionBoxSx, detailGridSx } from '../../config/layoutTokens.js';
import { useListSelection } from '../../hooks/useListSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

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

  /* ── Selection (new system) ─────────────────────────────────── */
  const selection = useListSelection(rows);
  const { selectedRows, allActive, allArchived } = selection;

  /* ── Dialog state ───────────────────────────────────────────── */
  const [viewOpen, setViewOpen] = useState(false);
  const [viewMemo, setViewMemo] = useState(null);
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
    setViewMemo(row);
    setViewOpen(true);
  }, []);

  const handleEdit = useCallback((row) => {
    setEditRow(row);
    setEditForm({
      credit_number: row.credit_number ?? '', credit_date: row.credit_date?.slice(0, 10) ?? '',
      amount: row.amount ?? '', reason: row.reason ?? '', status: row.status ?? 'open',
    });
    setEditOpen(true);
  }, []);

  const handleCreate = async () => {
    try { await createMut.mutateAsync({ ...createForm, amount: Number(createForm.amount) || 0 }); toast('Credit memo created'); setCreateOpen(false); setCreateForm(BLANK_CREATE); } catch (err) { toast(errMsg(err), 'error'); }
  };
  const handleUpdate = async () => {
    try { await updateMut.mutateAsync({ filter: { id: editRow.id }, changes: { ...editForm, amount: Number(editForm.amount) || 0 } }); toast('Credit memo updated'); setEditOpen(false); setEditRow(null); } catch (err) { toast(errMsg(err), 'error'); }
  };

  const { setArchiveOpen, setRestoreOpen, archiveConfirmProps, restoreConfirmProps } = useArchiveRestore({
    selectedRows, archiveMut, restoreMut, entityName: 'credit memo', entityNamePlural: 'credit memos', setSelectionModel: () => selection.clearSelection(), toast, errMsg, getLabel: (r) => r.credit_number,
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
      label: 'Create Memo',
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
            <span>Credit Memo Details</span>
            {viewMemo && (
              <Typography variant="body2" color="text.secondary">
                {viewMemo.credit_number}
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
          {viewMemo && (
            <Box sx={detailGridSx}>
              <FieldRow label="Credit Number" value={viewMemo.credit_number || '\u2014'} />
              <FieldRow label="Vendor" value={viewMemo.vendor_id?.slice(0, 8) || '\u2014'} />
              <FieldRow label="Credit Date" value={fmtDate(viewMemo.credit_date)} />
              <FieldRow label="Amount" value={viewMemo.amount != null ? Number(viewMemo.amount).toLocaleString(undefined, { style: 'currency', currency: 'USD' }) : '\u2014'} />
              <FieldRow label="Status">
                <StatusBadge status={viewMemo.status} />
              </FieldRow>
              <FieldRow label="Reason" value={viewMemo.reason || '\u2014'} />
              <FieldRow label="Created" value={fmtDate(viewMemo.created_at)} />
              <FieldRow label="Updated" value={fmtDate(viewMemo.updated_at)} />
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create Credit Memo Dialog ────────────────────────────── */}
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

      {/* ── Edit Credit Memo Dialog ──────────────────────────────── */}
      <FormDialog open={editOpen} title="Edit Credit Memo" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => { setEditOpen(false); setEditRow(null); }}>
        <TextField label="Credit Number" value={editForm.credit_number} onChange={onEditField('credit_number')} />
        <TextField label="Credit Date" type="date" value={editForm.credit_date} onChange={onEditField('credit_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Amount" type="number" value={editForm.amount} onChange={onEditField('amount')} />
        <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Reason" multiline minRows={2} value={editForm.reason} onChange={onEditField('reason')} />
      </FormDialog>

      <ConfirmDialog {...archiveConfirmProps} />
      <ConfirmDialog {...restoreConfirmProps} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
