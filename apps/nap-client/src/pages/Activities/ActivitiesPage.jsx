/**
 * @file Activities management page — list, create, edit, view, archive/restore
 * @module nap-client/pages/Activities/ActivitiesPage
 *
 * Activities belong to a category and represent specific work items
 * that can be budgeted and tracked for cost management.
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
  useActivities,
  useCreateActivity,
  useUpdateActivity,
  useArchiveActivity,
  useRestoreActivity,
} from '../../hooks/useActivities.js';
import { useCategories } from '../../hooks/useCategories.js';
import { pageContainerSx, formGridSx, dialogHeaderSx, dialogActionBoxSx, detailGridSx } from '../../config/layoutTokens.js';
import { useListSelection } from '../../hooks/useListSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const BLANK_CREATE = { code: '', name: '', category_id: '', is_active: true };
const BLANK_EDIT = { code: '', name: '', category_id: '', is_active: true };

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

export default function ActivitiesPage() {
  const { data: res, isLoading } = useActivities();
  const { data: catRes } = useCategories({ limit: 200, includeDeactivated: 'false' });
  const categories = catRes?.rows ?? [];
  const catMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);

  const allRows = res?.rows ?? [];

  const columns = useMemo(
    () => [
      { field: 'code', headerName: 'Code', width: 120 },
      { field: 'name', headerName: 'Name', flex: 1, minWidth: 200 },
      {
        field: 'category_id',
        headerName: 'Category',
        width: 160,
        valueGetter: (params) => catMap[params.row.category_id]?.name ?? '',
      },
      {
        field: 'is_active',
        headerName: 'Active',
        width: 100,
        valueGetter: (params) => (params.row.is_active ? 'Yes' : 'No'),
      },
      { field: 'created_at', headerName: 'Created', width: 160, valueGetter: (params) => params.row.created_at?.slice(0, 10) },
    ],
    [catMap],
  );

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateActivity();
  const updateMut = useUpdateActivity();
  const archiveMut = useArchiveActivity();
  const restoreMut = useRestoreActivity();

  /* ── Selection (new system) ─────────────────────────────────── */
  const selection = useListSelection(rows);
  const { selectedRows, allActive, allArchived } = selection;

  /* ── Dialog state ───────────────────────────────────────────── */
  const [viewOpen, setViewOpen] = useState(false);
  const [viewActivity, setViewActivity] = useState(null);
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
    setViewActivity(row);
    setViewOpen(true);
  }, []);

  const handleEdit = useCallback((row) => {
    setEditRow(row);
    setEditForm({
      code: row.code || '',
      name: row.name || '',
      category_id: row.category_id || '',
      is_active: row.is_active ?? true,
    });
    setEditOpen(true);
  }, []);

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(createForm);
      toast('Activity created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: editRow.id }, changes: editForm });
      toast('Activity updated');
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
    entityName: 'activity',
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
            <span>Activity Details</span>
            {viewActivity && (
              <Typography variant="body2" color="text.secondary">
                {viewActivity.name}
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
          {viewActivity && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={detailGridSx}>
                <FieldRow label="Code" value={viewActivity.code || '\u2014'} />
                <FieldRow label="Name" value={viewActivity.name} />
                <FieldRow label="Category" value={catMap[viewActivity.category_id]?.name || '\u2014'} />
                <FieldRow label="Status">
                  <StatusBadge status={viewActivity.deactivated_at ? 'archived' : 'active'} />
                </FieldRow>
                <FieldRow label="Created" value={fmtDate(viewActivity.created_at)} />
                <FieldRow label="Updated" value={fmtDate(viewActivity.updated_at)} />
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <FormDialog open={createOpen} title="Create Activity" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <Box sx={formGridSx}>
          <TextField label="Code" required value={createForm.code} onChange={onCreateField('code')} inputProps={{ maxLength: 16 }} />
          <TextField label="Name" required value={createForm.name} onChange={onCreateField('name')} inputProps={{ maxLength: 64 }} />
          <TextField label="Category" select required value={createForm.category_id} onChange={onCreateField('category_id')}>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
          <TextField label="Active" select value={String(createForm.is_active)} onChange={(e) => setCreateForm((p) => ({ ...p, is_active: e.target.value === 'true' }))}>
            <MenuItem value="true">Yes</MenuItem>
            <MenuItem value="false">No</MenuItem>
          </TextField>
        </Box>
      </FormDialog>

      {/* Edit Dialog */}
      <FormDialog open={editOpen} title="Edit Activity" submitLabel="Save" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => { setEditOpen(false); setEditRow(null); }}>
        <Box sx={formGridSx}>
          <TextField label="Code" required value={editForm.code} onChange={onEditField('code')} inputProps={{ maxLength: 16 }} />
          <TextField label="Name" required value={editForm.name} onChange={onEditField('name')} inputProps={{ maxLength: 64 }} />
          <TextField label="Category" select required value={editForm.category_id} onChange={onEditField('category_id')}>
            {categories.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
          </TextField>
          <TextField label="Active" select value={String(editForm.is_active)} onChange={(e) => setEditForm((p) => ({ ...p, is_active: e.target.value === 'true' }))}>
            <MenuItem value="true">Yes</MenuItem>
            <MenuItem value="false">No</MenuItem>
          </TextField>
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
