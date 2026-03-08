/**
 * @file Deliverables management page — list, create, edit, assign, status workflow
 * @module nap-client/pages/Activities/DeliverablesPage
 *
 * Status workflow: pending → released → finished → canceled
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

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useDeliverables,
  useCreateDeliverable,
  useUpdateDeliverable,
  useArchiveDeliverable,
  useRestoreDeliverable,
} from '../../hooks/useDeliverables.js';
import { pageContainerSx, formGridSx } from '../../config/layoutTokens.js';
import { buildBulkActions } from '../../utils/selectionUtils.js';
import { useDataGridSelection } from '../../hooks/useDataGridSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const BLANK_CREATE = { name: '', description: '', status: 'pending', start_date: '', end_date: '' };
const BLANK_EDIT = { name: '', description: '', status: '', start_date: '', end_date: '' };

const STATUSES = ['pending', 'released', 'finished', 'canceled'];

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
      name: selected.name || '',
      description: selected.description || '',
      status: selected.status || '',
      start_date: selected.start_date || '',
      end_date: selected.end_date || '',
    });
    setEditOpen(true);
  }, [selected]);

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
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm });
      toast('Deliverable updated');
      setEditOpen(false);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const { setArchiveOpen, setRestoreOpen, archiveConfirmProps, restoreConfirmProps } = useArchiveRestore({
    selectedRows, archiveMut, restoreMut, entityName: 'deliverable', setSelectionModel, toast, errMsg, getLabel: (r) => r.name,
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
      <FormDialog open={createOpen} title="Create Deliverable" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <Box sx={formGridSx}>
          <TextField label="Name" required value={createForm.name} onChange={onCreateField('name')} inputProps={{ maxLength: 128 }} />
          <TextField label="Status" select value={createForm.status} onChange={onCreateField('status')}>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField label="Start Date" type="date" value={createForm.start_date} onChange={onCreateField('start_date')} InputLabelProps={{ shrink: true }} />
          <TextField label="End Date" type="date" value={createForm.end_date} onChange={onCreateField('end_date')} InputLabelProps={{ shrink: true }} />
          <TextField label="Description" multiline rows={3} value={createForm.description} onChange={onCreateField('description')} sx={{ gridColumn: '1 / -1' }} />
        </Box>
      </FormDialog>

      {/* Edit Dialog */}
      <FormDialog open={editOpen} title="Edit Deliverable" submitLabel="Save" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <Box sx={formGridSx}>
          <TextField label="Name" required value={editForm.name} onChange={onEditField('name')} inputProps={{ maxLength: 128 }} />
          <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField label="Start Date" type="date" value={editForm.start_date} onChange={onEditField('start_date')} InputLabelProps={{ shrink: true }} />
          <TextField label="End Date" type="date" value={editForm.end_date} onChange={onEditField('end_date')} InputLabelProps={{ shrink: true }} />
          <TextField label="Description" multiline rows={3} value={editForm.description} onChange={onEditField('description')} sx={{ gridColumn: '1 / -1' }} />
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
