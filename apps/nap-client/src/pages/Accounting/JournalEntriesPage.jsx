/**
 * @file Journal Entries CRUD page — DataGrid + create/edit/post/reverse/archive/restore
 * @module nap-client/pages/Accounting/JournalEntriesPage
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
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useJournalEntries, useCreateJournalEntry, useUpdateJournalEntry,
  usePostJournalEntries, useReverseJournalEntries,
  useArchiveJournalEntry, useRestoreJournalEntry,
} from '../../hooks/useAccounting.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

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
  const postMut = usePostJournalEntries();
  const reverseMut = useReverseJournalEntries();
  const archiveMut = useArchiveJournalEntry();
  const restoreMut = useRestoreJournalEntry();

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
    setEditForm({ entry_date: selected.entry_date?.slice(0, 10) ?? '', description: selected.description ?? '', status: selected.status ?? 'pending', source_type: selected.source_type ?? '' });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => { try { await createMut.mutateAsync(createForm); toast('Journal entry created'); setCreateOpen(false); setCreateForm(BLANK_CREATE); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleUpdate = async () => { try { await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm }); toast('Entry updated'); setEditOpen(false); } catch (err) { toast(errMsg(err), 'error'); } };
  const handlePost = async () => { try { await postMut.mutateAsync({ entry_ids: [selected.id] }); toast('Entry posted'); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleReverse = async () => { try { await reverseMut.mutateAsync({ entry_ids: [selected.id] }); toast('Entry reversed'); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleArchive = async () => { try { await archiveMut.mutateAsync({ id: selected.id }); toast('Entry archived'); setArchiveOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };
  const handleRestore = async () => { try { await restoreMut.mutateAsync({ id: selected.id }); toast('Entry restored'); setRestoreOpen(false); setSelectionModel([]); } catch (err) { toast(errMsg(err), 'error'); } };

  const toolbar = useMemo(() => ({
    tabs: [
      { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
      { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
      { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
    ],
    filters: [],
    primaryActions: [
      { label: 'Create Entry', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
      { label: 'Edit', variant: 'outlined', disabled: !selected, onClick: openEdit },
      { label: 'Post', variant: 'outlined', color: 'success', disabled: !selected || selected?.status !== 'pending', onClick: handlePost },
      { label: 'Reverse', variant: 'outlined', color: 'warning', disabled: !selected || selected?.status !== 'posted', onClick: handleReverse },
      { label: 'Archive', variant: 'outlined', color: 'error', disabled: !selected || isArchived, onClick: () => setArchiveOpen(true) },
      { label: 'Restore', variant: 'outlined', color: 'success', disabled: !selected || !isArchived, onClick: () => setRestoreOpen(true) },
    ],
  }), [selected, isArchived, viewFilter, openEdit, handlePost, handleReverse]);
  useModuleToolbarRegistration(toolbar);

  return (
    <Box sx={pageContainerSx}>
      <DataGrid rows={rows} columns={columns} getRowId={(r) => r.id} loading={isLoading} checkboxSelection disableMultipleRowSelection rowSelectionModel={selectionModel} onRowSelectionModelChange={setSelectionModel} pageSizeOptions={[25, 50, 100]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')} />

      <FormDialog open={createOpen} title="Create Journal Entry" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Entry Date" type="date" required value={createForm.entry_date} onChange={onCreateField('entry_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Description" multiline minRows={2} value={createForm.description} onChange={onCreateField('description')} />
        <TextField label="Status" select value={createForm.status} onChange={onCreateField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Source Type" value={createForm.source_type} onChange={onCreateField('source_type')} />
      </FormDialog>

      <FormDialog open={editOpen} title="Edit Journal Entry" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <TextField label="Entry Date" type="date" value={editForm.entry_date} onChange={onEditField('entry_date')} InputLabelProps={{ shrink: true }} />
        <TextField label="Description" multiline minRows={2} value={editForm.description} onChange={onEditField('description')} />
        <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Source Type" value={editForm.source_type} onChange={onEditField('source_type')} />
      </FormDialog>

      <ConfirmDialog open={archiveOpen} title="Archive Entry" message="Archive this journal entry?" confirmLabel="Archive" confirmColor="error" loading={archiveMut.isPending} onConfirm={handleArchive} onCancel={() => setArchiveOpen(false)} />
      <ConfirmDialog open={restoreOpen} title="Restore Entry" message="Restore this journal entry?" confirmLabel="Restore" confirmColor="success" loading={restoreMut.isPending} onConfirm={handleRestore} onCancel={() => setRestoreOpen(false)} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
