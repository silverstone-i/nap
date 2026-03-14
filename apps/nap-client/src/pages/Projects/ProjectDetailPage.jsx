/**
 * @file Project detail page — tabbed view with Units, Tasks, and Cost Items
 * @module nap-client/pages/Projects/ProjectDetailPage
 *
 * Accessed via /projects/:id. Shows project header and three sub-grids.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import Chip from '@mui/material/Chip';

import DataTable from '../../components/shared/DataTable.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import { useProject } from '../../hooks/useProjects.js';
import { useUnits, useCreateUnit, useUpdateUnit, useArchiveUnit, useRestoreUnit } from '../../hooks/useUnits.js';
import { useTasks, useCreateTask, useUpdateTask, useArchiveTask, useRestoreTask } from '../../hooks/useTasks.js';
import { useCostItems, useCreateCostItem, useUpdateCostItem, useArchiveCostItem, useRestoreCostItem } from '../../hooks/useCostItems.js';
import { pageContainerSx } from '../../config/layoutTokens.js';
import { useListSelection } from '../../hooks/useListSelection.js';

/* ── column definitions ───────────────────────── */
const unitCols = [
  { field: 'unit_code', headerName: 'Code', width: 120 },
  { field: 'name', headerName: 'Unit Name', flex: 1, minWidth: 180 },
  { field: 'status', headerName: 'Status', width: 110 },
];

const taskCols = [
  { field: 'task_code', headerName: 'Code', width: 120 },
  { field: 'name', headerName: 'Task Name', flex: 1, minWidth: 180 },
  { field: 'duration_days', headerName: 'Days', width: 80, type: 'number' },
  { field: 'status', headerName: 'Status', width: 110 },
];

const costItemCols = [
  { field: 'item_code', headerName: 'Code', width: 120 },
  { field: 'description', headerName: 'Description', flex: 1, minWidth: 180 },
  { field: 'cost_class', headerName: 'Class', width: 110 },
  { field: 'quantity', headerName: 'Qty', width: 90, type: 'number' },
  { field: 'unit_cost', headerName: 'Unit Cost', width: 110, type: 'number' },
  { field: 'amount', headerName: 'Amount', width: 120, type: 'number' },
];

/* ── blank forms ──────────────────────────────── */
const BLANK_UNIT = { unit_code: '', name: '' };
const BLANK_TASK = { task_code: '', name: '', duration_days: '' };
const BLANK_COST = { item_code: '', description: '', cost_class: 'labor', quantity: '', unit_cost: '' };

export default function ProjectDetailPage() {
  const { id: projectId } = useParams();
  const { data: project } = useProject(projectId);

  const [tab, setTab] = useState(0);

  /* ── Units ──────────────────────────────────── */
  const { data: unitsRes, isLoading: unitsLoading } = useUnits({ project_id: projectId, limit: 200, includeDeactivated: 'true' });
  const unitRows = useMemo(() => (unitsRes?.rows ?? []).filter((r) => !r.deactivated_at), [unitsRes]);
  const createUnitMut = useCreateUnit();
  const updateUnitMut = useUpdateUnit();
  const archiveUnitMut = useArchiveUnit();
  const _restoreUnitMut = useRestoreUnit();

  const unitSelection = useListSelection(unitRows);
  const [unitCreateOpen, setUnitCreateOpen] = useState(false);
  const [unitEditOpen, setUnitEditOpen] = useState(false);
  const [editUnitRow, setEditUnitRow] = useState(null);
  const [unitArchiveOpen, setUnitArchiveOpen] = useState(false);
  const [unitForm, setUnitForm] = useState(BLANK_UNIT);
  const [unitEditForm, setUnitEditForm] = useState(BLANK_UNIT);

  /* ── Tasks ──────────────────────────────────── */
  const { data: tasksRes, isLoading: tasksLoading } = useTasks(
    unitSelection.selected ? { unit_id: unitSelection.selected.id, limit: 200, includeDeactivated: 'true' } : { unit_id: '__none__', limit: 0 },
  );
  const taskRows = useMemo(() => (tasksRes?.rows ?? []).filter((r) => !r.deactivated_at), [tasksRes]);
  const createTaskMut = useCreateTask();
  const updateTaskMut = useUpdateTask();
  const archiveTaskMut = useArchiveTask();
  const _restoreTaskMut = useRestoreTask();

  const taskSelection = useListSelection(taskRows);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [taskEditOpen, setTaskEditOpen] = useState(false);
  const [editTaskRow, setEditTaskRow] = useState(null);
  const [taskArchiveOpen, setTaskArchiveOpen] = useState(false);
  const [taskForm, setTaskForm] = useState(BLANK_TASK);
  const [taskEditForm, setTaskEditForm] = useState(BLANK_TASK);

  /* ── Cost Items ─────────────────────────────── */
  const { data: costRes, isLoading: costLoading } = useCostItems(
    taskSelection.selected ? { task_id: taskSelection.selected.id, limit: 200, includeDeactivated: 'true' } : { task_id: '__none__', limit: 0 },
  );
  const costRows = useMemo(() => (costRes?.rows ?? []).filter((r) => !r.deactivated_at), [costRes]);
  const createCostMut = useCreateCostItem();
  const updateCostMut = useUpdateCostItem();
  const archiveCostMut = useArchiveCostItem();
  const _restoreCostMut = useRestoreCostItem();

  const costSelection = useListSelection(costRows);
  const [costCreateOpen, setCostCreateOpen] = useState(false);
  const [costEditOpen, setCostEditOpen] = useState(false);
  const [editCostRow, setEditCostRow] = useState(null);
  const [costArchiveOpen, setCostArchiveOpen] = useState(false);
  const [costForm, setCostForm] = useState(BLANK_COST);
  const [costEditForm, setCostEditForm] = useState(BLANK_COST);

  /* ── Toast ──────────────────────────────────── */
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  /* ── Toolbar ────────────────────────────────── */
  const toolbar = useMemo(() => ({ tabs: [], filters: [], primaryActions: [] }), []);
  useModuleToolbarRegistration(toolbar);

  /* ── Edit callbacks (kebab menu) ───────────── */
  const handleEditUnit = useCallback((row) => {
    setEditUnitRow(row);
    setUnitEditForm({ unit_code: row.unit_code ?? '', name: row.name ?? '' });
    setUnitEditOpen(true);
  }, []);

  const handleEditTask = useCallback((row) => {
    setEditTaskRow(row);
    setTaskEditForm({ task_code: row.task_code ?? '', name: row.name ?? '', duration_days: row.duration_days ?? '' });
    setTaskEditOpen(true);
  }, []);

  const handleEditCost = useCallback((row) => {
    setEditCostRow(row);
    setCostEditForm({
      item_code: row.item_code ?? '',
      description: row.description ?? '',
      cost_class: row.cost_class ?? 'labor',
      quantity: row.quantity ?? '',
      unit_cost: row.unit_cost ?? '',
    });
    setCostEditOpen(true);
  }, []);

  /* ── Handlers: Units ────────────────────────── */
  const handleCreateUnit = async () => {
    try {
      await createUnitMut.mutateAsync({ ...unitForm, project_id: projectId });
      toast('Unit created');
      setUnitCreateOpen(false);
      setUnitForm(BLANK_UNIT);
    } catch (err) { toast(errMsg(err), 'error'); }
  };

  const handleUpdateUnit = async () => {
    try {
      await updateUnitMut.mutateAsync({ filter: { id: editUnitRow.id }, changes: unitEditForm });
      toast('Unit updated');
      setUnitEditOpen(false);
      setEditUnitRow(null);
    } catch (err) { toast(errMsg(err), 'error'); }
  };

  const handleArchiveUnit = async () => {
    try {
      const targets = unitSelection.selectedRows.filter((r) => !r.deactivated_at);
      for (const row of targets) await archiveUnitMut.mutateAsync({ id: row.id });
      toast(targets.length === 1 ? 'Unit archived' : `${targets.length} units archived`);
      setUnitArchiveOpen(false);
      unitSelection.clearSelection();
    } catch (err) { toast(errMsg(err), 'error'); }
  };

  /* ── Handlers: Tasks ────────────────────────── */
  const handleCreateTask = async () => {
    try {
      await createTaskMut.mutateAsync({ ...taskForm, unit_id: unitSelection.selected.id });
      toast('Task created');
      setTaskCreateOpen(false);
      setTaskForm(BLANK_TASK);
    } catch (err) { toast(errMsg(err), 'error'); }
  };

  const handleUpdateTask = async () => {
    try {
      await updateTaskMut.mutateAsync({ filter: { id: editTaskRow.id }, changes: taskEditForm });
      toast('Task updated');
      setTaskEditOpen(false);
      setEditTaskRow(null);
    } catch (err) { toast(errMsg(err), 'error'); }
  };

  const handleArchiveTask = async () => {
    try {
      const targets = taskSelection.selectedRows.filter((r) => !r.deactivated_at);
      for (const row of targets) await archiveTaskMut.mutateAsync({ id: row.id });
      toast(targets.length === 1 ? 'Task archived' : `${targets.length} tasks archived`);
      setTaskArchiveOpen(false);
      taskSelection.clearSelection();
    } catch (err) { toast(errMsg(err), 'error'); }
  };

  /* ── Handlers: Cost Items ───────────────────── */
  const handleCreateCost = async () => {
    try {
      await createCostMut.mutateAsync({ ...costForm, task_id: taskSelection.selected.id });
      toast('Cost item created');
      setCostCreateOpen(false);
      setCostForm(BLANK_COST);
    } catch (err) { toast(errMsg(err), 'error'); }
  };

  const handleUpdateCost = async () => {
    try {
      await updateCostMut.mutateAsync({ filter: { id: editCostRow.id }, changes: costEditForm });
      toast('Cost item updated');
      setCostEditOpen(false);
      setEditCostRow(null);
    } catch (err) { toast(errMsg(err), 'error'); }
  };

  const handleArchiveCost = async () => {
    try {
      const targets = costSelection.selectedRows.filter((r) => !r.deactivated_at);
      for (const row of targets) await archiveCostMut.mutateAsync({ id: row.id });
      toast(targets.length === 1 ? 'Cost item archived' : `${targets.length} cost items archived`);
      setCostArchiveOpen(false);
      costSelection.clearSelection();
    } catch (err) { toast(errMsg(err), 'error'); }
  };

  const onField = (setter) => (f) => (e) => setter((p) => ({ ...p, [f]: e.target.value }));

  return (
    <Box sx={{ ...pageContainerSx, gap: 1 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
        <Typography variant="h6">{project?.project_code}</Typography>
        <Typography variant="h6" sx={{ flex: 1 }}>{project?.name}</Typography>
        {project?.status && <Chip label={project.status} size="small" color="primary" variant="outlined" />}
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5 } }}>
        <Tab label="Units" />
        <Tab label="Tasks" />
        <Tab label="Cost Items" />
      </Tabs>

      {/* ── Units Tab ──────────────────────────── */}
      {tab === 0 && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip label="Add Unit" size="small" color="primary" onClick={() => { setUnitForm(BLANK_UNIT); setUnitCreateOpen(true); }} />
            <Chip label={unitSelection.selectedRows.length > 1 ? `Archive (${unitSelection.selectedRows.length})` : 'Archive'} size="small" variant="outlined" color="error" disabled={!unitSelection.hasSelection || !unitSelection.allActive} onClick={() => setUnitArchiveOpen(true)} />
          </Box>
          <DataTable
            rows={unitRows}
            columns={unitCols}
            loading={unitsLoading}
            selection={unitSelection}
            onEdit={handleEditUnit}
            dataGridProps={{ density: 'compact' }}
          />
        </Box>
      )}

      {/* ── Tasks Tab ──────────────────────────── */}
      {tab === 1 && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {unitSelection.selected ? `Tasks for unit: ${unitSelection.selected.name}` : 'Select a unit in the Units tab first'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip label="Add Task" size="small" color="primary" disabled={!unitSelection.selected} onClick={() => { setTaskForm(BLANK_TASK); setTaskCreateOpen(true); }} />
            <Chip label={taskSelection.selectedRows.length > 1 ? `Archive (${taskSelection.selectedRows.length})` : 'Archive'} size="small" variant="outlined" color="error" disabled={!taskSelection.hasSelection || !taskSelection.allActive} onClick={() => setTaskArchiveOpen(true)} />
          </Box>
          <DataTable
            rows={taskRows}
            columns={taskCols}
            loading={tasksLoading}
            selection={taskSelection}
            onEdit={handleEditTask}
            dataGridProps={{ density: 'compact' }}
          />
        </Box>
      )}

      {/* ── Cost Items Tab ─────────────────────── */}
      {tab === 2 && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {taskSelection.selected ? `Cost items for task: ${taskSelection.selected.name}` : 'Select a task in the Tasks tab first'}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Chip label="Add Cost Item" size="small" color="primary" disabled={!taskSelection.selected} onClick={() => { setCostForm(BLANK_COST); setCostCreateOpen(true); }} />
            <Chip label={costSelection.selectedRows.length > 1 ? `Archive (${costSelection.selectedRows.length})` : 'Archive'} size="small" variant="outlined" color="error" disabled={!costSelection.hasSelection || !costSelection.allActive} onClick={() => setCostArchiveOpen(true)} />
          </Box>
          <DataTable
            rows={costRows}
            columns={costItemCols}
            loading={costLoading}
            selection={costSelection}
            onEdit={handleEditCost}
            dataGridProps={{ density: 'compact' }}
          />
        </Box>
      )}

      {/* ── Dialogs: Units ─────────────────────── */}
      <FormDialog open={unitCreateOpen} title="Add Unit" submitLabel="Create" loading={createUnitMut.isPending} onSubmit={handleCreateUnit} onCancel={() => setUnitCreateOpen(false)}>
        <TextField label="Unit Code" required value={unitForm.unit_code} onChange={onField(setUnitForm)('unit_code')} inputProps={{ maxLength: 32 }} />
        <TextField label="Unit Name" required value={unitForm.name} onChange={onField(setUnitForm)('name')} />
      </FormDialog>
      <FormDialog open={unitEditOpen} title="Edit Unit" submitLabel="Save" loading={updateUnitMut.isPending} onSubmit={handleUpdateUnit} onCancel={() => { setUnitEditOpen(false); setEditUnitRow(null); }}>
        <TextField label="Unit Code" required value={unitEditForm.unit_code} onChange={onField(setUnitEditForm)('unit_code')} inputProps={{ maxLength: 32 }} />
        <TextField label="Unit Name" required value={unitEditForm.name} onChange={onField(setUnitEditForm)('name')} />
      </FormDialog>
      <ConfirmDialog open={unitArchiveOpen} title="Archive Unit" message={unitSelection.hasSelection ? (unitSelection.selectedRows.length === 1 ? `Archive "${unitSelection.selectedRows[0].name}"? Tasks and cost items will also be archived.` : `Archive ${unitSelection.selectedRows.length} units? Tasks and cost items will also be archived.`) : ''} confirmLabel="Archive" confirmColor="error" loading={archiveUnitMut.isPending} onConfirm={handleArchiveUnit} onCancel={() => setUnitArchiveOpen(false)} />

      {/* ── Dialogs: Tasks ─────────────────────── */}
      <FormDialog open={taskCreateOpen} title="Add Task" submitLabel="Create" loading={createTaskMut.isPending} onSubmit={handleCreateTask} onCancel={() => setTaskCreateOpen(false)}>
        <TextField label="Task Code" value={taskForm.task_code} onChange={onField(setTaskForm)('task_code')} inputProps={{ maxLength: 16 }} />
        <TextField label="Task Name" required value={taskForm.name} onChange={onField(setTaskForm)('name')} />
        <TextField label="Duration (days)" type="number" value={taskForm.duration_days} onChange={onField(setTaskForm)('duration_days')} />
      </FormDialog>
      <FormDialog open={taskEditOpen} title="Edit Task" submitLabel="Save" loading={updateTaskMut.isPending} onSubmit={handleUpdateTask} onCancel={() => { setTaskEditOpen(false); setEditTaskRow(null); }}>
        <TextField label="Task Code" value={taskEditForm.task_code} onChange={onField(setTaskEditForm)('task_code')} inputProps={{ maxLength: 16 }} />
        <TextField label="Task Name" required value={taskEditForm.name} onChange={onField(setTaskEditForm)('name')} />
        <TextField label="Duration (days)" type="number" value={taskEditForm.duration_days} onChange={onField(setTaskEditForm)('duration_days')} />
      </FormDialog>
      <ConfirmDialog open={taskArchiveOpen} title="Archive Task" message={taskSelection.hasSelection ? (taskSelection.selectedRows.length === 1 ? `Archive "${taskSelection.selectedRows[0].name}"? Cost items will also be archived.` : `Archive ${taskSelection.selectedRows.length} tasks? Cost items will also be archived.`) : ''} confirmLabel="Archive" confirmColor="error" loading={archiveTaskMut.isPending} onConfirm={handleArchiveTask} onCancel={() => setTaskArchiveOpen(false)} />

      {/* ── Dialogs: Cost Items ────────────────── */}
      <FormDialog open={costCreateOpen} title="Add Cost Item" submitLabel="Create" loading={createCostMut.isPending} onSubmit={handleCreateCost} onCancel={() => setCostCreateOpen(false)}>
        <TextField label="Item Code" value={costForm.item_code} onChange={onField(setCostForm)('item_code')} inputProps={{ maxLength: 16 }} />
        <TextField label="Description" value={costForm.description} onChange={onField(setCostForm)('description')} />
        <TextField label="Cost Class" required value={costForm.cost_class} onChange={onField(setCostForm)('cost_class')} helperText="labor, material, subcontract, equipment, other" />
        <TextField label="Quantity" type="number" required value={costForm.quantity} onChange={onField(setCostForm)('quantity')} />
        <TextField label="Unit Cost" type="number" required value={costForm.unit_cost} onChange={onField(setCostForm)('unit_cost')} />
      </FormDialog>
      <FormDialog open={costEditOpen} title="Edit Cost Item" submitLabel="Save" loading={updateCostMut.isPending} onSubmit={handleUpdateCost} onCancel={() => { setCostEditOpen(false); setEditCostRow(null); }}>
        <TextField label="Item Code" value={costEditForm.item_code} onChange={onField(setCostEditForm)('item_code')} inputProps={{ maxLength: 16 }} />
        <TextField label="Description" value={costEditForm.description} onChange={onField(setCostEditForm)('description')} />
        <TextField label="Cost Class" required value={costEditForm.cost_class} onChange={onField(setCostEditForm)('cost_class')} />
        <TextField label="Quantity" type="number" required value={costEditForm.quantity} onChange={onField(setCostEditForm)('quantity')} />
        <TextField label="Unit Cost" type="number" required value={costEditForm.unit_cost} onChange={onField(setCostEditForm)('unit_cost')} />
      </FormDialog>
      <ConfirmDialog open={costArchiveOpen} title="Archive Cost Item" message={costSelection.hasSelection ? (costSelection.selectedRows.length === 1 ? `Archive "${costSelection.selectedRows[0].description || costSelection.selectedRows[0].item_code}"?` : `Archive ${costSelection.selectedRows.length} cost items?`) : ''} confirmLabel="Archive" confirmColor="error" loading={archiveCostMut.isPending} onConfirm={handleArchiveCost} onCancel={() => setCostArchiveOpen(false)} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
