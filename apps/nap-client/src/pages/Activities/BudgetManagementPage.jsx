/**
 * @file Budget management page — list, approval workflow, version history
 * @module nap-client/pages/Activities/BudgetManagementPage
 *
 * Status workflow: draft → submitted → approved → locked | rejected
 * Approved budgets are read-only; new changes spawn a new version.
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
import { useBudgets, useCreateBudget, useUpdateBudget, useArchiveBudget, useCreateBudgetVersion } from '../../hooks/useBudgets.js';
import { useDeliverables } from '../../hooks/useDeliverables.js';
import { useActivities } from '../../hooks/useActivities.js';
import { pageContainerSx, formGridSx } from '../../config/layoutTokens.js';
import { buildBulkActions } from '../../utils/selectionUtils.js';
import { useDataGridSelection } from '../../hooks/useDataGridSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const BLANK_CREATE = { deliverable_id: '', activity_id: '', budgeted_amount: '', status: 'draft' };
const BLANK_EDIT = { budgeted_amount: '', status: '' };

const STATUSES = ['draft', 'submitted', 'approved', 'locked', 'rejected'];

export default function BudgetManagementPage() {
  const { data: res, isLoading } = useBudgets();
  const { data: delivRes } = useDeliverables();
  const { data: actRes } = useActivities();
  const allRows = res?.rows ?? [];
  const deliverables = (delivRes?.rows ?? []).filter((d) => !d.deactivated_at);
  const activities = (actRes?.rows ?? []).filter((a) => !a.deactivated_at);

  const deliverableMap = useMemo(() => Object.fromEntries(deliverables.map((d) => [d.id, d.name])), [deliverables]);
  const activityMap = useMemo(() => Object.fromEntries(activities.map((a) => [a.id, `${a.code} — ${a.name}`])), [activities]);

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    if (viewFilter === 'current') return allRows.filter((r) => !r.deactivated_at && r.is_current);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateBudget();
  const updateMut = useUpdateBudget();
  const archiveMut = useArchiveBudget();
  const newVersionMut = useCreateBudgetVersion();

  const { selectionModel, setSelectionModel, onSelectionChange, selectedRows, selected, isSingle, hasSelection, allActive } =
    useDataGridSelection(rows);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);

  const [createForm, setCreateForm] = useState(BLANK_CREATE);
  const [editForm, setEditForm] = useState(BLANK_EDIT);

  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  const onCreateField = (f) => (e) => setCreateForm((p) => ({ ...p, [f]: e.target.value }));
  const onEditField = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.value }));

  const openEdit = useCallback(() => {
    if (!selected) return;
    setEditForm({ budgeted_amount: selected.budgeted_amount || '', status: selected.status || '' });
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(createForm);
      toast('Budget created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm });
      toast('Budget updated');
      setEditOpen(false);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleNewVersion = async () => {
    try {
      await newVersionMut.mutateAsync({ budget_id: selected.id });
      toast('New budget version created');
      setVersionOpen(false);
      setSelectionModel([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const { setArchiveOpen, archiveConfirmProps } = useArchiveRestore({
    selectedRows, archiveMut, entityName: 'budget', setSelectionModel, toast, errMsg,
    getLabel: (r) => `budget v${r.version}`,
  });

  const canNewVersion = isSingle && (selected?.status === 'approved' || selected?.status === 'locked');

  const columns = useMemo(
    () => [
      {
        field: 'deliverable_id',
        headerName: 'Deliverable',
        flex: 1,
        minWidth: 180,
        valueGetter: (params) => deliverableMap[params.row.deliverable_id] || params.row.deliverable_id,
      },
      {
        field: 'activity_id',
        headerName: 'Activity',
        flex: 1,
        minWidth: 180,
        valueGetter: (params) => activityMap[params.row.activity_id] || params.row.activity_id,
      },
      { field: 'budgeted_amount', headerName: 'Amount', width: 140, type: 'number' },
      { field: 'version', headerName: 'Ver', width: 70, type: 'number' },
      {
        field: 'is_current',
        headerName: 'Current',
        width: 90,
        valueGetter: (params) => (params.row.is_current ? 'Yes' : 'No'),
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 120,
        renderCell: ({ value }) => <StatusBadge status={value} />,
      },
      { field: 'approved_at', headerName: 'Approved', width: 140, valueGetter: (params) => params.row.approved_at?.slice(0, 10) || '' },
    ],
    [deliverableMap, activityMap],
  );

  const toolbar = useMemo(
    () => ({
      tabs: [
        { value: 'current', label: 'Current', selected: viewFilter === 'current', onClick: () => { setViewFilter('current'); setSelectionModel([]); } },
        { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
        { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
        { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
      ],
      filters: [],
      primaryActions: [
        { label: 'Create', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
        { label: 'Edit', variant: 'outlined', disabled: !isSingle, onClick: openEdit },
        { label: 'New Version', variant: 'outlined', disabled: !canNewVersion, onClick: () => setVersionOpen(true) },
        ...buildBulkActions({ selectedRows, hasSelection, allActive, onArchive: () => setArchiveOpen(true) }),
      ],
    }),
    [isSingle, hasSelection, allActive, selectedRows.length, viewFilter, openEdit, canNewVersion, setSelectionModel, setArchiveOpen],
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
      <FormDialog open={createOpen} title="Create Budget" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <Box sx={formGridSx}>
          <TextField label="Deliverable" required select value={createForm.deliverable_id} onChange={onCreateField('deliverable_id')}>
            {deliverables.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
          </TextField>
          <TextField label="Activity" required select value={createForm.activity_id} onChange={onCreateField('activity_id')}>
            {activities.map((a) => <MenuItem key={a.id} value={a.id}>{a.code} — {a.name}</MenuItem>)}
          </TextField>
          <TextField label="Budgeted Amount" type="number" required value={createForm.budgeted_amount} onChange={onCreateField('budgeted_amount')} />
        </Box>
      </FormDialog>

      {/* Edit Dialog */}
      <FormDialog open={editOpen} title="Edit Budget" submitLabel="Save" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => setEditOpen(false)}>
        <Box sx={formGridSx}>
          <TextField label="Budgeted Amount" type="number" value={editForm.budgeted_amount} onChange={onEditField('budgeted_amount')} />
          <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
        </Box>
      </FormDialog>

      {/* New Version Confirm */}
      <ConfirmDialog
        open={versionOpen}
        title="Create New Budget Version"
        message={selected ? `Create a new draft version from budget v${selected.version}? The current version will be marked as superseded.` : ''}
        confirmLabel="Create Version"
        loading={newVersionMut.isPending}
        onConfirm={handleNewVersion}
        onCancel={() => setVersionOpen(false)}
      />

      <ConfirmDialog {...archiveConfirmProps} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
