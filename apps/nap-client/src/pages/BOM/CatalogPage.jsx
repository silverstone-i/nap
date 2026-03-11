/**
 * @file Catalog SKU management page — DataTable + create/edit/view/archive/restore/embedding refresh
 * @module nap-client/pages/BOM/CatalogPage
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
  useCatalogSkus,
  useCreateCatalogSku,
  useUpdateCatalogSku,
  useArchiveCatalogSku,
  useRestoreCatalogSku,
  useRefreshCatalogEmbeddings,
} from '../../hooks/useBom.js';
import { pageContainerSx, formGridSx } from '../../config/layoutTokens.js';
import { useListSelection } from '../../hooks/useListSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const BLANK_CREATE = { catalog_sku: '', description: '', category: '', sub_category: '' };
const BLANK_EDIT = { catalog_sku: '', description: '', category: '', sub_category: '' };

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

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

const detailGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
  gap: 1.5,
};

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

  /* ── Selection (new system) ─────────────────────────────────── */
  const selection = useListSelection(rows);
  const { selectedRows, allActive, allArchived } = selection;

  /* ── Dialog state ───────────────────────────────────────────── */
  const [viewOpen, setViewOpen] = useState(false);
  const [viewSku, setViewSku] = useState(null);
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

  const categories = useMemo(() => [...new Set(allRows.map((r) => r.category).filter(Boolean))].sort(), [allRows]);

  /* ── Row action callbacks ──────────────────────────────────── */
  const handleView = useCallback((row) => {
    setViewSku(row);
    setViewOpen(true);
  }, []);

  const handleEdit = useCallback((row) => {
    setEditRow(row);
    setEditForm({
      catalog_sku: row.catalog_sku || '',
      description: row.description || '',
      category: row.category || '',
      sub_category: row.sub_category || '',
    });
    setEditOpen(true);
  }, []);

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
      await updateMut.mutateAsync({ filter: { id: editRow.id }, changes: editForm });
      toast('Catalog SKU updated');
      setEditOpen(false);
      setEditRow(null);
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
    selectedRows,
    archiveMut,
    restoreMut,
    entityName: 'catalog SKU',
    setSelectionModel: () => selection.clearSelection(),
    toast,
    errMsg,
    getLabel: (r) => r.catalog_sku,
  });

  /* ── ModuleBar: tabs + Archive/Restore + Refresh Embeddings + Create ─ */
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
      label: 'Refresh Embeddings',
      variant: 'outlined',
      disabled: refreshMut.isPending,
      onClick: handleRefreshEmbeddings,
    });

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
  }, [viewFilter, selectedRows.length, allActive, allArchived, selection.clearSelection, setArchiveOpen, setRestoreOpen, refreshMut.isPending]);
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
            <span>Catalog SKU Details</span>
            {viewSku && (
              <Typography variant="body2" color="text.secondary">
                {viewSku.catalog_sku}
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
          {viewSku && (
            <Box sx={detailGridSx}>
              <FieldRow label="Catalog SKU" value={viewSku.catalog_sku || '\u2014'} />
              <FieldRow label="Description" value={viewSku.description || '\u2014'} />
              <FieldRow label="Category" value={viewSku.category || '\u2014'} />
              <FieldRow label="Sub-Category" value={viewSku.sub_category || '\u2014'} />
              <FieldRow label="Embedded" value={viewSku.embedding ? 'Yes' : 'No'} />
              <FieldRow label="Status">
                <StatusBadge status={viewSku.deactivated_at ? 'archived' : 'active'} />
              </FieldRow>
              <FieldRow label="Created" value={fmtDate(viewSku.created_at)} />
              <FieldRow label="Updated" value={fmtDate(viewSku.updated_at)} />
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create Dialog ─────────────────────────────────────────── */}
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

      {/* ── Edit Dialog ───────────────────────────────────────────── */}
      <FormDialog open={editOpen} title="Edit Catalog SKU" submitLabel="Save" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => { setEditOpen(false); setEditRow(null); }}>
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
