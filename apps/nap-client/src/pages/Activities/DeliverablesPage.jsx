/**
 * @file Deliverables management page — list, create, edit, view, assign, status workflow
 * @module nap-client/pages/Activities/DeliverablesPage
 *
 * Status workflow: pending -> released -> finished -> canceled
 *
 * Migrated to standardised list-view selection system:
 *   useListSelection + DataTable + RowActionsMenu
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import Typography from '@mui/material/Typography';

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import DataTable from '../../components/shared/DataTable.jsx';
import FieldRow from '../../components/shared/FieldRow.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useDeliverables,
  useCreateDeliverable,
  useUpdateDeliverable,
  useArchiveDeliverable,
  useRestoreDeliverable,
} from '../../hooks/useDeliverables.js';
import { pageContainerSx, formGridSx, dialogHeaderSx, dialogActionBoxSx, formFullSpanSx, detailGridSx } from '../../config/layoutTokens.js';
import { useListSelection } from '../../hooks/useListSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const BLANK_CREATE = { name: '', description: '', status: 'pending', start_date: '', end_date: '' };
const BLANK_EDIT = { name: '', description: '', status: '', start_date: '', end_date: '' };

const STATUSES = ['pending', 'released', 'finished', 'canceled'];

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

const columns = [
  { field: 'name', headerName: 'Name', flex: 1, minWidth: 200 },
  {
    field: 'status',
    headerName: 'Status',
    width: 120,
    renderCell: ({ value }) => <StatusBadge status={value} />,
  },
  { field: 'start_date', headerName: 'Start', width: 120 },
  { field: 'end_date', headerName: 'End', width: 120 },
  { field: 'created_at', headerName: 'Created', width: 160, valueGetter: (params) => params.row.created_at?.slice(0, 10) },
];

export default function DeliverablesPage() {
  const { data: res, isLoading } = useDeliverables();
  const allRows = res?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateDeliverable();
  const updateMut = useUpdateDeliverable();
  const archiveMut = useArchiveDeliverable();
  const restoreMut = useRestoreDeliverable();

  /* ── Selection (new system) ─────────────────────────────────── */
  const selection = useListSelection(rows);
  const { selectedRows, allActive, allArchived } = selection;

  /* ── Dialog state ───────────────────────────────────────────── */
  const [viewOpen, setViewOpen] = useState(false);
  const [viewDeliverable, setViewDeliverable] = useState(null);
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
    setViewDeliverable(row);
    setViewOpen(true);
  }, []);

  const handleEdit = useCallback((row) => {
    setEditRow(row);
    setEditForm({
      name: row.name || '',
      description: row.description || '',
      status: row.status || '',
      start_date: row.start_date || '',
      end_date: row.end_date || '',
    });
    setEditOpen(true);
  }, []);

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(createForm);
      toast('Deliverable created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: editRow.id }, changes: editForm });
      toast('Deliverable updated');
      setEditOpen(false);
      setEditRow(null);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const { setArchiveOpen, setRestoreOpen, archiveConfirmProps, restoreConfirmProps } = useArchiveRestore({
    selectedRows,
    archiveMut,
    restoreMut,
    entityName: 'deliverable',
    setSelectionModel: () => selection.clearSelection(),
    toast,
    errMsg,
    getLabel: (r) => r.name,
  });

  /* ── ModuleBar: tabs + Create + Archive/Restore ────────────── */
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
      label: 'Create',
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
            <span>Deliverable Details</span>
            {viewDeliverable && (
              <Typography variant="body2" color="text.secondary">
                {viewDeliverable.name}
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
          {viewDeliverable && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={detailGridSx}>
                <FieldRow label="Name" value={viewDeliverable.name} />
                <FieldRow label="Status">
                  <StatusBadge status={viewDeliverable.status} />
                </FieldRow>
                <FieldRow label="Start Date" value={fmtDate(viewDeliverable.start_date)} />
                <FieldRow label="End Date" value={fmtDate(viewDeliverable.end_date)} />
                <FieldRow label="Description" value={viewDeliverable.description || '\u2014'} />
                <FieldRow label="Created" value={fmtDate(viewDeliverable.created_at)} />
                <FieldRow label="Updated" value={fmtDate(viewDeliverable.updated_at)} />
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <FormDialog open={createOpen} title="Create Deliverable" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <Box sx={formGridSx}>
          <TextField label="Name" required value={createForm.name} onChange={onCreateField('name')} inputProps={{ maxLength: 128 }} />
          <TextField label="Status" select value={createForm.status} onChange={onCreateField('status')}>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField label="Start Date" type="date" value={createForm.start_date} onChange={onCreateField('start_date')} InputLabelProps={{ shrink: true }} />
          <TextField label="End Date" type="date" value={createForm.end_date} onChange={onCreateField('end_date')} InputLabelProps={{ shrink: true }} />
          <TextField label="Description" multiline rows={3} value={createForm.description} onChange={onCreateField('description')} sx={formFullSpanSx} />
        </Box>
      </FormDialog>

      {/* Edit Dialog */}
      <FormDialog open={editOpen} title="Edit Deliverable" submitLabel="Save" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => { setEditOpen(false); setEditRow(null); }}>
        <Box sx={formGridSx}>
          <TextField label="Name" required value={editForm.name} onChange={onEditField('name')} inputProps={{ maxLength: 128 }} />
          <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField label="Start Date" type="date" value={editForm.start_date} onChange={onEditField('start_date')} InputLabelProps={{ shrink: true }} />
          <TextField label="End Date" type="date" value={editForm.end_date} onChange={onEditField('end_date')} InputLabelProps={{ shrink: true }} />
          <TextField label="Description" multiline rows={3} value={editForm.description} onChange={onEditField('description')} sx={formFullSpanSx} />
        </Box>
      </FormDialog>

      <ConfirmDialog {...archiveConfirmProps} />
      <ConfirmDialog {...restoreConfirmProps} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
