/**
 * @file Activities management page — list, create, edit, archive/restore
 * @module nap-client/pages/Activities/ActivitiesPage
 *
 * Activities belong to a category and represent specific work items
 * that can be budgeted and tracked for cost management.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { DataGrid } from '@mui/x-data-grid';

import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
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
import { pageContainerSx, formGridSx } from '../../config/layoutTokens.js';
import { buildBulkActions } from '../../utils/selectionUtils.js';
import { useDataGridSelection } from '../../hooks/useDataGridSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const BLANK_CREATE = { code: '', name: '', category_id: '', is_active: true };
const BLANK_EDIT = { code: '', name: '', category_id: '', is_active: true };

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

  const { selectionModel, setSelectionModel, onSelectionChange, selectedRows, selected, isSingle, hasSelection, allActive, allArchived } =
    useDataGridSelection(rows);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [createForm, setCreateForm] = useState(BLANK_CREATE);
  const [editForm, setEditForm] = useState(BLANK_EDIT);

  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  const onCreateField = (f) => (e) => setCreateForm((p) => ({ ...p, [f]: e.target.value }));
  const onEditField = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.value }));

  const openEdit = useCallback(() => {
    if (!selected) return;
    setEditForm({
      code: selected.code || '',
      name: selected.name || '',
      category_id: selected.category_id || '',
      is_active: selected.is_active ?? true,
    });
    setEditOpen(true);
  }, [selected]);

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
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm });
      toast('Activity updated');
      setEditOpen(false);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const { setArchiveOpen, setRestoreOpen, archiveConfirmProps, restoreConfirmProps } = useArchiveRestore({
    selectedRows, archiveMut, restoreMut, entityName: 'activity', setSelectionModel, toast, errMsg, getLabel: (r) => r.name,
  });

  const toolbar = useMemo(
    () => ({
      tabs: [
        { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
        { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
        { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
      ],
      filters: [],
      primaryActions: [
        { label: 'Create', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
        { label: 'Edit', variant: 'outlined', disabled: !isSingle, onClick: openEdit },
        ...buildBulkActions({ selectedRows, hasSelection, allActive, allArchived, onArchive: () => setArchiveOpen(true), onRestore: () => setRestoreOpen(true) }),
      ],
    }),
    [isSingle, hasSelection, allActive, allArchived, selectedRows.length, viewFilter, openEdit, setSelectionModel, setArchiveOpen, setRestoreOpen],
  );
  useModuleToolbarRegistration(toolbar);

  return (
    <Box sx={pageContainerSx}>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        loading={isLoading}
        checkboxSelection
        rowSelectionModel={selectionModel}
        onRowSelectionModelChange={onSelectionChange}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')}
      />

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
      <FormDialog open={editOpen} title="Edit Activity" submitLabel="Save" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
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
