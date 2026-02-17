/**
 * @file Project detail page — tabbed view with Units, Tasks, Cost Items sub-grids
 * @module nap-client/pages/Projects/ProjectDetailPage
 *
 * Allows drilling into a project to manage its units, tasks, and cost items.
 * Each tab provides its own DataGrid + CRUD dialogs.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import CurrencyCell from '../../components/shared/CurrencyCell.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useProjects, useUnits, useTasks, useCostItems } from '../../hooks/useProjects.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const STATUS_OPTS = ['active', 'planning', 'on_hold', 'completed', 'cancelled'];
const cap = (s) => (s ? s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '');

/* ── Column defs ─────────────────────────────────────────────── */

const unitColumns = [
  { field: 'unit_code', headerName: 'Code', width: 120 },
  { field: 'name', headerName: 'Unit Name', flex: 1, minWidth: 180 },
  { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusBadge status={value} /> },
];

const taskColumns = [
  { field: 'task_code', headerName: 'Code', width: 120 },
  { field: 'name', headerName: 'Task', flex: 1, minWidth: 180 },
  { field: 'duration_days', headerName: 'Duration (d)', width: 120, type: 'number' },
  { field: 'status', headerName: 'Status', width: 120, renderCell: ({ value }) => <StatusBadge status={value} /> },
];

const costItemColumns = [
  { field: 'item_code', headerName: 'Code', width: 120 },
  { field: 'description', headerName: 'Description', flex: 1, minWidth: 200 },
  { field: 'cost_class', headerName: 'Class', width: 120 },
  { field: 'quantity', headerName: 'Qty', width: 100, type: 'number' },
  { field: 'unit_cost', headerName: 'Unit Cost', width: 120, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'amount', headerName: 'Amount', width: 130, renderCell: (params) => <CurrencyCell value={params.value} /> },
];

export default function ProjectDetailPage() {
  const { data: projRes } = useProjects({ limit: 500 });
  const projects = projRes?.rows ?? [];

  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState(0);

  const unitsCrud = useUnits();
  const tasksCrud = useTasks();
  const costItemsCrud = useCostItems();

  const unitRows = useMemo(() => (unitsCrud.list.data?.rows ?? []).filter((r) => r.project_id === projectId), [unitsCrud.list.data, projectId]);
  const taskRows = useMemo(() => (tasksCrud.list.data?.rows ?? []).filter((r) => unitRows.some((u) => u.id === r.unit_id)), [tasksCrud.list.data, unitRows]);
  const costItemRows = useMemo(() => (costItemsCrud.list.data?.rows ?? []).filter((r) => taskRows.some((t) => t.id === r.task_id)), [costItemsCrud.list.data, taskRows]);

  /* ── Unit create ───────────────────────────────────────────── */
  const [unitCreateOpen, setUnitCreateOpen] = useState(false);
  const [unitForm, setUnitForm] = useState({ unit_code: '', name: '', status: 'active' });

  const handleUnitCreate = async () => {
    try {
      await unitsCrud.create.mutateAsync({ ...unitForm, project_id: projectId });
      setUnitCreateOpen(false);
      setUnitForm({ unit_code: '', name: '', status: 'active' });
    } catch { /* snackbar */ }
  };

  /* ── snackbar ──────────────────────────────────────────────── */
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });

  return (
    <Box sx={pageContainerSx}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Project Detail</Typography>
        <TextField
          select label="Select Project" value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          sx={{ minWidth: 300, mb: 2 }} size="small"
        >
          <MenuItem value="">— Select —</MenuItem>
          {projects.map((p) => (
            <MenuItem key={p.id} value={p.id}>{p.project_code} — {p.name}</MenuItem>
          ))}
        </TextField>

        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1 }}>
          <Tab label="Units" />
          <Tab label="Tasks" />
          <Tab label="Cost Items" />
        </Tabs>
      </Box>

      {tab === 0 && (
        <DataGrid rows={unitRows} columns={unitColumns} getRowId={(r) => r.id} autoHeight disableRowSelectionOnClick pageSizeOptions={[25]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} />
      )}
      {tab === 1 && (
        <DataGrid rows={taskRows} columns={taskColumns} getRowId={(r) => r.id} autoHeight disableRowSelectionOnClick pageSizeOptions={[25]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} />
      )}
      {tab === 2 && (
        <DataGrid rows={costItemRows} columns={costItemColumns} getRowId={(r) => r.id} autoHeight disableRowSelectionOnClick pageSizeOptions={[25]} initialState={{ pagination: { paginationModel: { pageSize: 25 } } }} />
      )}

      <FormDialog open={unitCreateOpen} title="Create Unit" submitLabel="Create" loading={unitsCrud.create.isPending} onSubmit={handleUnitCreate} onCancel={() => setUnitCreateOpen(false)}>
        <TextField label="Unit Code" required value={unitForm.unit_code} onChange={(e) => setUnitForm((p) => ({ ...p, unit_code: e.target.value }))} />
        <TextField label="Name" required value={unitForm.name} onChange={(e) => setUnitForm((p) => ({ ...p, name: e.target.value }))} />
        <TextField label="Status" select value={unitForm.status} onChange={(e) => setUnitForm((p) => ({ ...p, status: e.target.value }))}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
      </FormDialog>

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
