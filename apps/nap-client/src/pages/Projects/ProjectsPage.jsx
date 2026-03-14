/**
 * @file Projects CRUD page — DataTable + create/edit/view/archive/restore
 * @module nap-client/pages/Projects/ProjectsPage
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import DataTable from '../../components/shared/DataTable.jsx';
import FieldRow from '../../components/shared/FieldRow.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useProjects, useCreateProject, useUpdateProject, useArchiveProject, useRestoreProject,
} from '../../hooks/useProjects.js';
import { pageContainerSx, dialogHeaderSx, dialogActionBoxSx, detailGridSx } from '../../config/layoutTokens.js';
import { useListSelection } from '../../hooks/useListSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const BLANK_CREATE = { project_code: '', name: '', description: '', notes: '', contract_amount: '' };
const BLANK_EDIT = { project_code: '', name: '', description: '', notes: '', contract_amount: '' };

const STATUS_MAP = { planning: 'active', budgeting: 'active', released: 'active', complete: 'suspended' };

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

const columns = [
  { field: 'project_code', headerName: 'Code', width: 130 },
  { field: 'name', headerName: 'Project Name', flex: 1, minWidth: 200 },
  {
    field: 'status',
    headerName: 'Status',
    width: 120,
    renderCell: ({ value }) => <StatusBadge status={STATUS_MAP[value] || 'active'} label={value} />,
  },
  { field: 'contract_amount', headerName: 'Contract Amount', width: 160, type: 'number' },
];

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { data: res, isLoading } = useProjects();
  const allRows = res?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateProject();
  const updateMut = useUpdateProject();
  const archiveMut = useArchiveProject();
  const restoreMut = useRestoreProject();

  /* ── Selection (new system) ─────────────────────────────────── */
  const selection = useListSelection(rows);
  const { selectedRows, allActive, allArchived } = selection;

  /* ── Dialog state ───────────────────────────────────────────── */
  const [viewOpen, setViewOpen] = useState(false);
  const [viewProject, setViewProject] = useState(null);
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
    setViewProject(row);
    setViewOpen(true);
  }, []);

  const handleEdit = useCallback((row) => {
    setEditRow(row);
    setEditForm({
      project_code: row.project_code ?? '',
      name: row.name ?? '',
      description: row.description ?? '',
      notes: row.notes ?? '',
      contract_amount: row.contract_amount ?? '',
    });
    setEditOpen(true);
  }, []);

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(createForm);
      toast('Project created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: editRow.id }, changes: editForm });
      toast('Project updated');
      setEditOpen(false);
      setEditRow(null);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const { setArchiveOpen, setRestoreOpen, archiveConfirmProps, restoreConfirmProps } = useArchiveRestore({
    selectedRows,
    archiveMut,
    restoreMut,
    entityName: 'project',
    setSelectionModel: () => selection.clearSelection(),
    toast,
    errMsg,
    getLabel: (r) => r.name,
  });

  /* ── Custom row actions (Detail link) ──────────────────────── */
  const getRowActions = useCallback((_row) => [
    { label: 'Detail', icon: <OpenInNewIcon fontSize="small" />, onClick: (r) => navigate(`/projects/${r.id}`) },
  ], [navigate]);

  /* ── ModuleBar: tabs + Archive/Restore + Create ────────────── */
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
      label: 'Create Project',
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
  }, [viewFilter, selectedRows.length, allActive, allArchived, selection.clearSelection, setArchiveOpen, setRestoreOpen]);
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
        rowActions={getRowActions}
        dataGridProps={{ onRowDoubleClick: (params) => navigate(`/projects/${params.id}`) }}
      />

      {/* ── View Details Dialog ──────────────────────────────────── */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={dialogHeaderSx}>
          <Box>
            <span>Project Details</span>
            {viewProject && (
              <Typography variant="body2" color="text.secondary">
                {viewProject.name}
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
          {viewProject && (
            <Box sx={detailGridSx}>
              <FieldRow label="Project Code" value={viewProject.project_code || '\u2014'} />
              <FieldRow label="Name" value={viewProject.name} />
              <FieldRow label="Status">
                <StatusBadge status={STATUS_MAP[viewProject.status] || 'active'} label={viewProject.status} />
              </FieldRow>
              <FieldRow label="Contract Amount" value={viewProject.contract_amount ?? '\u2014'} />
              <FieldRow label="Created" value={fmtDate(viewProject.created_at)} />
              <FieldRow label="Updated" value={fmtDate(viewProject.updated_at)} />
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create Project Dialog ─────────────────────────────────── */}
      <FormDialog open={createOpen} title="Create Project" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Project Code" required value={createForm.project_code} onChange={onCreateField('project_code')} inputProps={{ maxLength: 32 }} />
        <TextField label="Project Name" required value={createForm.name} onChange={onCreateField('name')} />
        <TextField label="Description" multiline minRows={2} value={createForm.description} onChange={onCreateField('description')} />
        <TextField label="Contract Amount" type="number" value={createForm.contract_amount} onChange={onCreateField('contract_amount')} />
        <TextField label="Notes" multiline minRows={2} value={createForm.notes} onChange={onCreateField('notes')} />
      </FormDialog>

      {/* ── Edit Project Dialog ──────────────────────────────────── */}
      <FormDialog open={editOpen} title="Edit Project" submitLabel="Save Changes" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => { setEditOpen(false); setEditRow(null); }}>
        <TextField label="Project Code" required value={editForm.project_code} onChange={onEditField('project_code')} inputProps={{ maxLength: 32 }} />
        <TextField label="Project Name" required value={editForm.name} onChange={onEditField('name')} />
        <TextField label="Description" multiline minRows={2} value={editForm.description} onChange={onEditField('description')} />
        <TextField label="Contract Amount" type="number" value={editForm.contract_amount} onChange={onEditField('contract_amount')} />
        <TextField label="Notes" multiline minRows={2} value={editForm.notes} onChange={onEditField('notes')} />
      </FormDialog>

      <ConfirmDialog {...archiveConfirmProps} />
      <ConfirmDialog {...restoreConfirmProps} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
