/**
 * @file Budget management page — list, approval workflow, version history
 * @module nap-client/pages/Activities/BudgetManagementPage
 *
 * Status workflow: draft → submitted → approved → locked | rejected
 * Approved budgets are read-only; new changes spawn a new version.
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
import { useBudgets, useCreateBudget, useUpdateBudget, useArchiveBudget, useCreateBudgetVersion } from '../../hooks/useBudgets.js';
import { useDeliverables } from '../../hooks/useDeliverables.js';
import { useActivities } from '../../hooks/useActivities.js';
import { pageContainerSx, formGridSx } from '../../config/layoutTokens.js';
import { useListSelection } from '../../hooks/useListSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const BLANK_CREATE = { deliverable_id: '', activity_id: '', budgeted_amount: '', status: 'draft' };
const BLANK_EDIT = { budgeted_amount: '', status: '' };

const STATUSES = ['draft', 'submitted', 'approved', 'locked', 'rejected'];

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

const detailGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
  gap: 1.5,
};

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

  /* ── Selection (new system) ─────────────────────────────────── */
  const selection = useListSelection(rows);
  const { selectedRows, allActive } = selection;

  /* ── Dialog state ───────────────────────────────────────────── */
  const [viewOpen, setViewOpen] = useState(false);
  const [viewBudget, setViewBudget] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [versionOpen, setVersionOpen] = useState(false);

  const [createForm, setCreateForm] = useState(BLANK_CREATE);
  const [editForm, setEditForm] = useState(BLANK_EDIT);

  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  const onCreateField = (f) => (e) => setCreateForm((p) => ({ ...p, [f]: e.target.value }));
  const onEditField = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.value }));

  /* ── Row action callbacks ──────────────────────────────────── */
  const handleView = useCallback((row) => {
    setViewBudget(row);
    setViewOpen(true);
  }, []);

  const handleEdit = useCallback((row) => {
    setEditRow(row);
    setEditForm({ budgeted_amount: row.budgeted_amount || '', status: row.status || '' });
    setEditOpen(true);
  }, []);

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
      await updateMut.mutateAsync({ filter: { id: editRow.id }, changes: editForm });
      toast('Budget updated');
      setEditOpen(false);
      setEditRow(null);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleNewVersion = async () => {
    try {
      await newVersionMut.mutateAsync({ budget_id: selection.selected.id });
      toast('New budget version created');
      setVersionOpen(false);
      selection.clearSelection();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const { setArchiveOpen, archiveConfirmProps } = useArchiveRestore({
    selectedRows,
    archiveMut,
    entityName: 'budget',
    setSelectionModel: () => selection.clearSelection(),
    toast,
    errMsg,
    getLabel: (r) => `budget v${r.version}`,
  });

  const canNewVersion = selection.isSingle && (selection.selected?.status === 'approved' || selection.selected?.status === 'locked');

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

  /* ── ModuleBar: tabs + Create + New Version + Archive ──────── */
  const toolbar = useMemo(() => {
    const primary = [];

    if (viewFilter === 'current' || viewFilter === 'active' || viewFilter === 'all') {
      primary.push({
        label: selectedRows.length > 1 ? `Archive (${selectedRows.length})` : 'Archive',
        variant: 'outlined',
        color: 'error',
        disabled: selectedRows.length === 0 || !allActive,
        onClick: () => setArchiveOpen(true),
      });
    }

    primary.push({
      label: 'New Version',
      variant: 'outlined',
      disabled: !canNewVersion,
      onClick: () => setVersionOpen(true),
    });

    primary.push({
      label: 'Create Budget',
      variant: 'contained',
      color: 'primary',
      onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); },
    });

    return {
      tabs: [
        { value: 'current', label: 'Current', selected: viewFilter === 'current', onClick: () => { setViewFilter('current'); selection.clearSelection(); } },
        { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); selection.clearSelection(); } },
        { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); selection.clearSelection(); } },
        { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); selection.clearSelection(); } },
      ],
      filters: [],
      primaryActions: primary,
    };
  }, [viewFilter, selectedRows.length, allActive, canNewVersion, selection.clearSelection, setArchiveOpen]);
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
            <span>Budget Details</span>
            {viewBudget && (
              <Typography variant="body2" color="text.secondary">
                {deliverableMap[viewBudget.deliverable_id] || viewBudget.deliverable_id}
                {' / '}
                {activityMap[viewBudget.activity_id] || viewBudget.activity_id}
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
          {viewBudget && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={detailGridSx}>
                <FieldRow label="Deliverable" value={deliverableMap[viewBudget.deliverable_id] || viewBudget.deliverable_id} />
                <FieldRow label="Activity" value={activityMap[viewBudget.activity_id] || viewBudget.activity_id} />
                <FieldRow label="Budgeted Amount" value={viewBudget.budgeted_amount} />
                <FieldRow label="Version" value={viewBudget.version} />
                <FieldRow label="Is Current" value={viewBudget.is_current ? 'Yes' : 'No'} />
                <FieldRow label="Status">
                  <StatusBadge status={viewBudget.status} />
                </FieldRow>
                <FieldRow label="Approved At" value={fmtDate(viewBudget.approved_at)} />
                <FieldRow label="Created" value={fmtDate(viewBudget.created_at)} />
                <FieldRow label="Updated" value={fmtDate(viewBudget.updated_at)} />
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

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
      <FormDialog open={editOpen} title="Edit Budget" submitLabel="Save" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => { setEditOpen(false); setEditRow(null); }}>
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
        message={selection.selected ? `Create a new draft version from budget v${selection.selected.version}? The current version will be marked as superseded.` : ''}
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
