/**
 * @file Journal Entries CRUD page — DataTable + create/edit/view/post/reverse/archive/restore
 * @module nap-client/pages/Accounting/JournalEntriesPage
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
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import DataTable from '../../components/shared/DataTable.jsx';
import FieldRow from '../../components/shared/FieldRow.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useJournalEntries, useCreateJournalEntry, useUpdateJournalEntry,
  usePostJournalEntry, useReverseJournalEntry,
  useArchiveJournalEntry, useRestoreJournalEntry,
} from '../../hooks/useAccounting.js';
import { pageContainerSx } from '../../config/layoutTokens.js';
import { useListSelection } from '../../hooks/useListSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const STATUS_OPTS = ['pending', 'posted', 'reversed'];
const cap = (s) => (s ? s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '');
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

const BLANK_CREATE = { entry_date: '', description: '', status: 'pending', source_type: '' };
const BLANK_EDIT = { entry_date: '', description: '', status: 'pending', source_type: '' };

const columns = [
  { field: 'id', headerName: 'ID', width: 100, valueGetter: (params) => params.row.id?.slice(0, 8) },
  { field: 'entry_date', headerName: 'Date', width: 120, valueGetter: (params) => fmtDate(params.row.entry_date) },
  { field: 'description', headerName: 'Description', flex: 1, minWidth: 200 },
  { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusBadge status={value} /> },
  { field: 'source_type', headerName: 'Source', width: 140, valueGetter: (params) => cap(params.row.source_type || '') },
];

const detailGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
  gap: 1.5,
};

export default function JournalEntriesPage() {
  const { data: res, isLoading } = useJournalEntries();
  const allRows = res?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateJournalEntry();
  const updateMut = useUpdateJournalEntry();
  const postMut = usePostJournalEntry();
  const reverseMut = useReverseJournalEntry();
  const archiveMut = useArchiveJournalEntry();
  const restoreMut = useRestoreJournalEntry();

  /* ── Selection (new system) ─────────────────────────────────── */
  const selection = useListSelection(rows);
  const { selectedRows, allActive, allArchived } = selection;

  /* ── Dialog state ───────────────────────────────────────────── */
  const [viewOpen, setViewOpen] = useState(false);
  const [viewEntry, setViewEntry] = useState(null);
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
    setViewEntry(row);
    setViewOpen(true);
  }, []);

  const handleEdit = useCallback((row) => {
    setEditRow(row);
    setEditForm({
      entry_date: row.entry_date?.slice(0, 10) ?? '',
      description: row.description ?? '',
      status: row.status ?? 'pending',
      source_type: row.source_type ?? '',
    });
    setEditOpen(true);
  }, []);

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(createForm);
      toast('Journal entry created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: editRow.id }, changes: editForm });
      toast('Entry updated');
      setEditOpen(false);
      setEditRow(null);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handlePost = useCallback(async () => {
    try {
      await postMut.mutateAsync({ entry_id: selection.selected.id });
      toast('Entry posted');
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  }, [selection.selected, postMut, toast]);

  const handleReverse = useCallback(async () => {
    try {
      await reverseMut.mutateAsync({ entry_id: selection.selected.id });
      toast('Entry reversed');
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  }, [selection.selected, reverseMut, toast]);

  const { setArchiveOpen, setRestoreOpen, archiveConfirmProps, restoreConfirmProps } = useArchiveRestore({
    selectedRows,
    archiveMut,
    restoreMut,
    entityName: 'journal entry',
    entityNamePlural: 'journal entries',
    setSelectionModel: () => selection.clearSelection(),
    toast,
    errMsg,
  });

  /* ── ModuleBar: tabs + Archive/Restore + Post/Reverse + Create ─ */
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
      label: 'Post',
      variant: 'outlined',
      color: 'success',
      disabled: !selection.isSingle || selection.selected?.status !== 'pending',
      onClick: handlePost,
    });
    primary.push({
      label: 'Reverse',
      variant: 'outlined',
      color: 'warning',
      disabled: !selection.isSingle || selection.selected?.status !== 'posted',
      onClick: handleReverse,
    });

    primary.push({
      label: 'Create Entry',
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
  }, [viewFilter, selectedRows.length, allActive, allArchived, selection.isSingle, selection.selected, selection.clearSelection, handlePost, handleReverse, setArchiveOpen, setRestoreOpen]);
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
            <span>Journal Entry Details</span>
            {viewEntry && (
              <Typography variant="body2" color="text.secondary">
                {viewEntry.description}
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
          {viewEntry && (
            <Box sx={detailGridSx}>
              <FieldRow label="ID" value={viewEntry.id?.slice(0, 8) || '\u2014'} />
              <FieldRow label="Entry Date" value={fmtDate(viewEntry.entry_date)} />
              <FieldRow label="Description" value={viewEntry.description || '\u2014'} />
              <FieldRow label="Status">
                <StatusBadge status={viewEntry.status} />
              </FieldRow>
              <FieldRow label="Source Type" value={cap(viewEntry.source_type || '') || '\u2014'} />
              <FieldRow label="Created" value={fmtDate(viewEntry.created_at)} />
              <FieldRow label="Updated" value={fmtDate(viewEntry.updated_at)} />
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create Journal Entry Dialog ───────────────────────────── */}
      <FormDialog open={createOpen} title="Create Journal Entry" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Entry Date" type="date" required value={createForm.entry_date} onChange={onCreateField('entry_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Description" multiline minRows={2} value={createForm.description} onChange={onCreateField('description')} />
        <TextField label="Status" select value={createForm.status} onChange={onCreateField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Source Type" value={createForm.source_type} onChange={onCreateField('source_type')} />
      </FormDialog>

      {/* ── Edit Journal Entry Dialog ─────────────────────────────── */}
      <FormDialog open={editOpen} title="Edit Journal Entry" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => { setEditOpen(false); setEditRow(null); }}>
        <TextField label="Entry Date" type="date" value={editForm.entry_date} onChange={onEditField('entry_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Description" multiline minRows={2} value={editForm.description} onChange={onEditField('description')} />
        <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Source Type" value={editForm.source_type} onChange={onEditField('source_type')} />
      </FormDialog>

      <ConfirmDialog {...archiveConfirmProps} />
      <ConfirmDialog {...restoreConfirmProps} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
