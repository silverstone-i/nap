/**
 * @file Cost tracking page — actual costs DataGrid with approval workflow
 * @module nap-client/pages/Activities/CostTrackingPage
 *
 * Approval workflow: pending → approved | rejected
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
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
import { useActualCosts, useCreateActualCost, useUpdateActualCost, useArchiveActualCost } from '../../hooks/useActualCosts.js';
import { useActivities } from '../../hooks/useActivities.js';
import { pageContainerSx, formGridSx } from '../../config/layoutTokens.js';
import { buildBulkActions } from '../../utils/selectionUtils.js';
import { useDataGridSelection } from '../../hooks/useDataGridSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const BLANK_CREATE = { activity_id: '', project_id: '', amount: '', currency: 'USD', reference: '', incurred_on: '' };
const BLANK_EDIT = { amount: '', currency: '', reference: '', approval_status: '', incurred_on: '' };

const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];

export default function CostTrackingPage() {
  const { data: res, isLoading } = useActualCosts();
  const { data: actRes } = useActivities();
  const allRows = res?.rows ?? [];
  const activities = (actRes?.rows ?? []).filter((a) => !a.deactivated_at);

  const activityMap = useMemo(() => Object.fromEntries(activities.map((a) => [a.id, `${a.code} — ${a.name}`])), [activities]);

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    if (viewFilter === 'pending') return allRows.filter((r) => !r.deactivated_at && r.approval_status === 'pending');
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateActualCost();
  const updateMut = useUpdateActualCost();
  const archiveMut = useArchiveActualCost();

  const { selectionModel, setSelectionModel, onSelectionChange, selectedRows, selected, isSingle, hasSelection, allActive } =
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
      amount: selected.amount || '',
      currency: selected.currency || 'USD',
      reference: selected.reference || '',
      approval_status: selected.approval_status || '',
      incurred_on: selected.incurred_on || '',
    });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(createForm);
      toast('Actual cost created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm });
      toast('Actual cost updated');
      setEditOpen(false);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const { setArchiveOpen, archiveConfirmProps } = useArchiveRestore({
    selectedRows, archiveMut, entityName: 'actual cost', entityNamePlural: 'actual costs', setSelectionModel, toast, errMsg,
  });

  const columns = useMemo(
    () => [
      {
        field: 'activity_id',
        headerName: 'Activity',
        flex: 1,
        minWidth: 180,
        valueGetter: (params) => activityMap[params.row.activity_id] || params.row.activity_id,
      },
      { field: 'amount', headerName: 'Amount', width: 130, type: 'number' },
      { field: 'currency', headerName: 'Currency', width: 90 },
      {
        field: 'approval_status',
        headerName: 'Status',
        width: 120,
        renderCell: ({ value }) => <StatusBadge status={value} />,
      },
      { field: 'incurred_on', headerName: 'Incurred On', width: 120 },
      { field: 'reference', headerName: 'Reference', flex: 1, minWidth: 150 },
      { field: 'created_at', headerName: 'Created', width: 140, valueGetter: (params) => params.row.created_at?.slice(0, 10) },
    ],
    [activityMap],
  );

  const toolbar = useMemo(
    () => ({
      tabs: [
        { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
        { value: 'pending', label: 'Pending', selected: viewFilter === 'pending', onClick: () => { setViewFilter('pending'); setSelectionModel([]); } },
        { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
        { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
      ],
      filters: [],
      primaryActions: [
        { label: 'Create', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
        { label: 'Edit', variant: 'outlined', disabled: !isSingle, onClick: openEdit },
        ...buildBulkActions({ selectedRows, hasSelection, allActive, onArchive: () => setArchiveOpen(true) }),
      ],
    }),
    [isSingle, hasSelection, allActive, selectedRows.length, viewFilter, openEdit, setSelectionModel, setArchiveOpen],
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
      <FormDialog open={createOpen} title="Record Actual Cost" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <Box sx={formGridSx}>
          <TextField label="Activity" required select value={createForm.activity_id} onChange={onCreateField('activity_id')}>
            {activities.map((a) => <MenuItem key={a.id} value={a.id}>{a.code} — {a.name}</MenuItem>)}
          </TextField>
          <TextField label="Amount" type="number" required value={createForm.amount} onChange={onCreateField('amount')} />
          <TextField label="Currency" value={createForm.currency} onChange={onCreateField('currency')} inputProps={{ maxLength: 3 }} />
          <TextField label="Incurred On" type="date" value={createForm.incurred_on} onChange={onCreateField('incurred_on')} InputLabelProps={{ shrink: true }} />
          <TextField label="Reference" value={createForm.reference} onChange={onCreateField('reference')} sx={{ gridColumn: '1 / -1' }} />
        </Box>
      </FormDialog>

      {/* Edit Dialog */}
      <FormDialog open={editOpen} title="Edit Actual Cost" submitLabel="Save" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <Box sx={formGridSx}>
          <TextField label="Amount" type="number" value={editForm.amount} onChange={onEditField('amount')} />
          <TextField label="Currency" value={editForm.currency} onChange={onEditField('currency')} inputProps={{ maxLength: 3 }} />
          <TextField label="Approval Status" select value={editForm.approval_status} onChange={onEditField('approval_status')}>
            {APPROVAL_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField label="Incurred On" type="date" value={editForm.incurred_on} onChange={onEditField('incurred_on')} InputLabelProps={{ shrink: true }} />
          <TextField label="Reference" value={editForm.reference} onChange={onEditField('reference')} sx={{ gridColumn: '1 / -1' }} />
        </Box>
      </FormDialog>

      <ConfirmDialog {...archiveConfirmProps} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
