/**
 * @file Catalog SKU management page — list, create, edit, archive/restore, embedding refresh
 * @module nap-client/pages/BOM/CatalogPage
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
  useCatalogSkus,
  useCreateCatalogSku,
  useUpdateCatalogSku,
  useArchiveCatalogSku,
  useRestoreCatalogSku,
  useRefreshCatalogEmbeddings,
} from '../../hooks/useBom.js';
import { pageContainerSx, formGridSx } from '../../config/layoutTokens.js';
import { buildBulkActions } from '../../utils/selectionUtils.js';
import { useDataGridSelection } from '../../hooks/useDataGridSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const BLANK_CREATE = { catalog_sku: '', description: '', category: '', sub_category: '' };
const BLANK_EDIT = { catalog_sku: '', description: '', category: '', sub_category: '' };

const columns = [
  { field: 'catalog_sku', headerName: 'SKU', width: 160 },
  { field: 'description', headerName: 'Description', flex: 1, minWidth: 250 },
  { field: 'category', headerName: 'Category', width: 150 },
  { field: 'sub_category', headerName: 'Sub-Category', width: 150 },
  {
    field: 'embedding',
    headerName: 'Embedded',
    width: 100,
    valueGetter: (params) => (params.row.embedding ? 'Yes' : 'No'),
  },
  { field: 'created_at', headerName: 'Created', width: 120, valueGetter: (params) => params.row.created_at?.slice(0, 10) },
];

export default function CatalogPage() {
  const { data: res, isLoading } = useCatalogSkus();
  const allRows = res?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateCatalogSku();
  const updateMut = useUpdateCatalogSku();
  const archiveMut = useArchiveCatalogSku();
  const restoreMut = useRestoreCatalogSku();
  const refreshMut = useRefreshCatalogEmbeddings();

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

  const categories = useMemo(() => [...new Set(allRows.map((r) => r.category).filter(Boolean))].sort(), [allRows]);

  const openEdit = useCallback(() => {
    if (!selected) return;
    setEditForm({
      catalog_sku: selected.catalog_sku || '',
      description: selected.description || '',
      category: selected.category || '',
      sub_category: selected.sub_category || '',
    });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(createForm);
      toast('Catalog SKU created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm });
      toast('Catalog SKU updated');
      setEditOpen(false);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleRefreshEmbeddings = async () => {
    try {
      const result = await refreshMut.mutateAsync();
      toast(`Refreshed ${result.refreshed ?? 0} embeddings`);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const { setArchiveOpen, setRestoreOpen, archiveConfirmProps, restoreConfirmProps } = useArchiveRestore({
    selectedRows, archiveMut, restoreMut, entityName: 'catalog SKU', setSelectionModel, toast, errMsg,
    getLabel: (r) => r.catalog_sku,
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
        { label: 'Refresh Embeddings', variant: 'outlined', disabled: refreshMut.isPending, onClick: handleRefreshEmbeddings },
      ],
    }),
    [isSingle, hasSelection, allActive, allArchived, selectedRows.length, viewFilter, openEdit, setSelectionModel, setArchiveOpen, setRestoreOpen, refreshMut.isPending],
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
      <FormDialog open={createOpen} title="Create Catalog SKU" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <Box sx={formGridSx}>
          <TextField label="SKU Code" required value={createForm.catalog_sku} onChange={onCreateField('catalog_sku')} inputProps={{ maxLength: 64 }} />
          <TextField label="Category" value={createForm.category} onChange={onCreateField('category')} select={categories.length > 0} inputProps={{ maxLength: 64 }}>
            {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <TextField label="Sub-Category" value={createForm.sub_category} onChange={onCreateField('sub_category')} inputProps={{ maxLength: 64 }} />
          <TextField label="Description" required multiline rows={3} value={createForm.description} onChange={onCreateField('description')} sx={{ gridColumn: '1 / -1' }} />
        </Box>
      </FormDialog>

      {/* Edit Dialog */}
      <FormDialog open={editOpen} title="Edit Catalog SKU" submitLabel="Save" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <Box sx={formGridSx}>
          <TextField label="SKU Code" required value={editForm.catalog_sku} onChange={onEditField('catalog_sku')} inputProps={{ maxLength: 64 }} />
          <TextField label="Category" value={editForm.category} onChange={onEditField('category')} select={categories.length > 0} inputProps={{ maxLength: 64 }}>
            {categories.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
          </TextField>
          <TextField label="Sub-Category" value={editForm.sub_category} onChange={onEditField('sub_category')} inputProps={{ maxLength: 64 }} />
          <TextField label="Description" required multiline rows={3} value={editForm.description} onChange={onEditField('description')} sx={{ gridColumn: '1 / -1' }} />
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
