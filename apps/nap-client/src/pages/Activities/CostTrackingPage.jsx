/**
 * @file Cost tracking page — DataTable with approval workflow
 * @module nap-client/pages/Activities/CostTrackingPage
 *
 * Approval workflow: pending -> approved | rejected
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
import { useActualCosts, useCreateActualCost, useUpdateActualCost, useArchiveActualCost } from '../../hooks/useActualCosts.js';
import { useActivities } from '../../hooks/useActivities.js';
import { pageContainerSx, formGridSx, dialogHeaderSx, dialogActionBoxSx, formFullSpanSx, detailGridSx } from '../../config/layoutTokens.js';
import { useListSelection } from '../../hooks/useListSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const BLANK_CREATE = { activity_id: '', project_id: '', amount: '', currency: 'USD', reference: '', incurred_on: '' };
const BLANK_EDIT = { amount: '', currency: '', reference: '', approval_status: '', incurred_on: '' };

const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

export default function CostTrackingPage() {
  const { data: res, isLoading } = useActualCosts();
  const { data: actRes } = useActivities();
  const allRows = res?.rows ?? [];
  const activities = (actRes?.rows ?? []).filter((a) => !a.deactivated_at);

  const activityMap = useMemo(() => Object.fromEntries(activities.map((a) => [a.id, `${a.code} \u2014 ${a.name}`])), [activities]);

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

  /* ── Selection (new system) ─────────────────────────────────── */
  const selection = useListSelection(rows);
  const { selectedRows, allActive } = selection;

  /* ── Dialog state ───────────────────────────────────────────── */
  const [viewOpen, setViewOpen] = useState(false);
  const [viewCost, setViewCost] = useState(null);
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
    setViewCost(row);
    setViewOpen(true);
  }, []);

  const handleEdit = useCallback((row) => {
    setEditRow(row);
    setEditForm({
      amount: row.amount || '',
      currency: row.currency || 'USD',
      reference: row.reference || '',
      approval_status: row.approval_status || '',
      incurred_on: row.incurred_on || '',
    });
    setEditOpen(true);
  }, []);

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
      await updateMut.mutateAsync({ filter: { id: editRow.id }, changes: editForm });
      toast('Actual cost updated');
      setEditOpen(false);
      setEditRow(null);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const { setArchiveOpen, archiveConfirmProps } = useArchiveRestore({
    selectedRows,
    archiveMut,
    entityName: 'actual cost',
    entityNamePlural: 'actual costs',
    setSelectionModel: () => selection.clearSelection(),
    toast,
    errMsg,
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

  /* ── ModuleBar: tabs + Archive + Create ────────────────────── */
  const toolbar = useMemo(() => {
    const primary = [];

    if (viewFilter === 'active' || viewFilter === 'pending' || viewFilter === 'all') {
      primary.push({
        label: selectedRows.length > 1 ? `Archive (${selectedRows.length})` : 'Archive',
        variant: 'outlined',
        color: 'error',
        disabled: selectedRows.length === 0 || !allActive,
        onClick: () => setArchiveOpen(true),
      });
    }

    primary.push({
      label: 'Record Actual Cost',
      variant: 'contained',
      color: 'primary',
      onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); },
    });

    return {
      tabs: [
        { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); selection.clearSelection(); } },
        { value: 'pending', label: 'Pending', selected: viewFilter === 'pending', onClick: () => { setViewFilter('pending'); selection.clearSelection(); } },
        { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); selection.clearSelection(); } },
        { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); selection.clearSelection(); } },
      ],
      filters: [],
      primaryActions: primary,
    };
  }, [viewFilter, selectedRows.length, allActive, selection.clearSelection, setArchiveOpen]);
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
            <span>Actual Cost Details</span>
            {viewCost && (
              <Typography variant="body2" color="text.secondary">
                {viewCost.reference || viewCost.amount}
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
          {viewCost && (
            <Box sx={detailGridSx}>
              <FieldRow label="Activity" value={activityMap[viewCost.activity_id] || viewCost.activity_id || '\u2014'} />
              <FieldRow label="Amount" value={viewCost.amount ?? '\u2014'} />
              <FieldRow label="Currency" value={viewCost.currency || '\u2014'} />
              <FieldRow label="Approval Status">
                <StatusBadge status={viewCost.approval_status} />
              </FieldRow>
              <FieldRow label="Incurred On" value={viewCost.incurred_on || '\u2014'} />
              <FieldRow label="Reference" value={viewCost.reference || '\u2014'} />
              <FieldRow label="Created" value={fmtDate(viewCost.created_at)} />
              <FieldRow label="Updated" value={fmtDate(viewCost.updated_at)} />
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create Dialog ─────────────────────────────────────────── */}
      <FormDialog open={createOpen} title="Record Actual Cost" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <Box sx={formGridSx}>
          <TextField label="Activity" required select value={createForm.activity_id} onChange={onCreateField('activity_id')}>
            {activities.map((a) => <MenuItem key={a.id} value={a.id}>{a.code} — {a.name}</MenuItem>)}
          </TextField>
          <TextField label="Amount" type="number" required value={createForm.amount} onChange={onCreateField('amount')} />
          <TextField label="Currency" value={createForm.currency} onChange={onCreateField('currency')} inputProps={{ maxLength: 3 }} />
          <TextField label="Incurred On" type="date" value={createForm.incurred_on} onChange={onCreateField('incurred_on')} InputLabelProps={{ shrink: true }} />
          <TextField label="Reference" value={createForm.reference} onChange={onCreateField('reference')} sx={formFullSpanSx} />
        </Box>
      </FormDialog>

      {/* ── Edit Dialog ───────────────────────────────────────────── */}
      <FormDialog open={editOpen} title="Edit Actual Cost" submitLabel="Save" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => { setEditOpen(false); setEditRow(null); }}>
        <Box sx={formGridSx}>
          <TextField label="Amount" type="number" value={editForm.amount} onChange={onEditField('amount')} />
          <TextField label="Currency" value={editForm.currency} onChange={onEditField('currency')} inputProps={{ maxLength: 3 }} />
          <TextField label="Approval Status" select value={editForm.approval_status} onChange={onEditField('approval_status')}>
            {APPROVAL_STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
          <TextField label="Incurred On" type="date" value={editForm.incurred_on} onChange={onEditField('incurred_on')} InputLabelProps={{ shrink: true }} />
          <TextField label="Reference" value={editForm.reference} onChange={onEditField('reference')} sx={formFullSpanSx} />
        </Box>
      </FormDialog>

      <ConfirmDialog {...archiveConfirmProps} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
