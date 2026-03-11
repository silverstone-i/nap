/**
 * @file Manage Roles page — master-detail layout with four-layer RBAC configuration
 * @module nap-client/pages/Tenant/ManageRolesPage
 *
 * Left panel: Roles DataTable with create / edit / view.
 * Right panel: Detail panel with Policies, State Filters, and Field Groups tabs.
 *
 * Roles with is_immutable=true are read-only across all tabs.
 * Roles with is_system=true are visually distinguished.
 *
 * Migrated to standardised list-view selection system:
 *   useListSelection + DataTable + RowActionsMenu
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';

import DataTable from '../../components/shared/DataTable.jsx';
import FieldRow from '../../components/shared/FieldRow.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import StatusBadge from '../../components/shared/StatusBadge.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import { useRoles, useCreateRole, useUpdateRole } from '../../hooks/useRoles.js';
import { masterDetailSx, masterPanelSx, detailPanelSx } from '../../config/layoutTokens.js';
import { useListSelection } from '../../hooks/useListSelection.js';

import PolicyEditor from './PolicyEditor.jsx';
import StateFilterEditor from './StateFilterEditor.jsx';
import FieldGroupEditor from './FieldGroupEditor.jsx';
import FieldGroupDefinitionEditor from './FieldGroupDefinitionEditor.jsx';

/* ── Enums ────────────────────────────────────────────────────── */

const SCOPE_OPTS = ['all_projects', 'assigned_companies', 'assigned_projects', 'self'];

/* ── Helpers ──────────────────────────────────────────────────── */

const cap = (s) =>
  s
    ? s
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : '';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

const detailGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
  gap: 1.5,
};

/* ── Empty form shapes ────────────────────────────────────────── */

const BLANK_CREATE = { code: '', name: '', description: '', scope: 'all_projects' };
const BLANK_EDIT = { name: '', description: '', scope: 'all_projects' };

/* ── Column definitions ───────────────────────────────────────── */

const columns = [
  { field: 'code', headerName: 'Code', width: 130 },
  { field: 'name', headerName: 'Name', flex: 1, minWidth: 140 },
  {
    field: 'scope',
    headerName: 'Scope',
    width: 150,
    renderCell: (params) => <StatusBadge status={params.row.scope} />,
  },
  {
    field: 'is_system',
    headerName: 'Type',
    width: 90,
    renderCell: (params) => {
      if (params.row.is_system) return <Chip label="System" size="small" color="info" />;
      if (params.row.is_immutable) return <Chip label="Locked" size="small" color="warning" />;
      return null;
    },
  },
];

/* ── Component ────────────────────────────────────────────────── */

export default function ManageRolesPage() {
  /* ── queries ─────────────────────────────────────────────── */
  const { data: res, isLoading } = useRoles();
  const rows = res?.rows ?? [];

  /* ── mutations ───────────────────────────────────────────── */
  const createMut = useCreateRole();
  const updateMut = useUpdateRole();

  /* ── selection ───────────────────────────────────────────── */
  const selection = useListSelection(rows);
  const isReadOnly = selection.selected?.is_immutable || selection.selected?.is_system;

  /* ── detail tab ────────────────────────────────────────────── */
  const [detailTab, setDetailTab] = useState(0);
  const [actionsContainer, setActionsContainer] = useState(null);

  /* ── dialog state ──────────────────────────────────────────── */
  const [viewOpen, setViewOpen] = useState(false);
  const [viewRole, setViewRole] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);

  /* ── form state ────────────────────────────────────────────── */
  const [createForm, setCreateForm] = useState(BLANK_CREATE);
  const [editForm, setEditForm] = useState(BLANK_EDIT);

  /* ── snackbar ──────────────────────────────────────────────── */
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  /* ── field change factories ────────────────────────────────── */
  const onCreateField = (f) => (e) => setCreateForm((p) => ({ ...p, [f]: e.target.value }));
  const onEditField = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.value }));

  /* ── Row action callbacks ──────────────────────────────────── */
  const handleView = useCallback((row) => {
    setViewRole(row);
    setViewOpen(true);
  }, []);

  const handleEdit = useCallback((row) => {
    setEditRow(row);
    setEditForm({
      name: row.name ?? '',
      description: row.description ?? '',
      scope: row.scope ?? 'all_projects',
    });
    setEditOpen(true);
  }, []);

  /** Conditional row actions — immutable roles cannot be edited */
  const getRowActions = useCallback((row) => {
    if (row.is_immutable) return [];
    return [{ label: 'Edit', icon: <EditOutlinedIcon fontSize="small" />, onClick: handleEdit }];
  }, [handleEdit]);

  /* ── CRUD handlers ─────────────────────────────────────────── */
  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(createForm);
      toast('Role created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: editRow.id }, changes: editForm });
      toast('Role updated');
      setEditOpen(false);
      setEditRow(null);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  /* ── toolbar registration ──────────────────────────────────── */
  const toolbar = useMemo(
    () => ({
      tabs: [],
      filters: [],
      primaryActions: [
        {
          label: 'Create Role',
          variant: 'contained',
          color: 'primary',
          onClick: () => {
            setCreateForm(BLANK_CREATE);
            setCreateOpen(true);
          },
        },
      ],
    }),
    [],
  );
  useModuleToolbarRegistration(toolbar);

  /* ── render ────────────────────────────────────────────────── */
  return (
    <Box sx={masterDetailSx}>
      {/* ── Left: Roles grid ──────────────────────────────────── */}
      <Box sx={selection.isSingle ? { ...masterPanelSx } : { flex: 1, display: 'flex', flexDirection: 'column' }}>
        <DataTable
          rows={rows}
          columns={columns}
          loading={isLoading}
          selection={selection}
          onView={handleView}
          rowActions={getRowActions}
        />
      </Box>

      {/* ── Right: Detail panel ───────────────────────────────── */}
      {selection.isSingle && (
        <Box sx={detailPanelSx}>
          {/* Role header */}
          <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6">{selection.selected.name}</Typography>
              {selection.selected.is_system && <Chip label="System" size="small" color="info" />}
              {selection.selected.is_immutable && <Chip label="Immutable" size="small" color="warning" />}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {selection.selected.code} &middot; Scope: {cap(selection.selected.scope)}
            </Typography>
            {selection.selected.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {selection.selected.description}
              </Typography>
            )}
          </Box>

          {/* Tab row: tabs left, action buttons right */}
          <Box sx={{ display: 'flex', alignItems: 'center', borderBottom: 1, borderColor: 'divider', mb: 1 }}>
            <Tabs
              value={detailTab}
              onChange={(_, v) => setDetailTab(v)}
              variant="scrollable"
              scrollButtons={false}
              sx={{ minWidth: 0 }}
            >
              <Tab label="Policies" />
              <Tab label="State Filters" />
              <Tab label="Field Groups" />
              <Tab label="Field Definitions" />
            </Tabs>
            <Box
              ref={setActionsContainer}
              sx={{ ml: 'auto', display: 'flex', gap: 1, pr: 0.5, flexShrink: 0, whiteSpace: 'nowrap' }}
            />
          </Box>

          {/* Tab content */}
          <Box sx={{ flex: 1, overflow: 'auto' }}>
            {detailTab === 0 && <PolicyEditor roleId={selection.selected.id} readOnly={isReadOnly} actionsContainer={actionsContainer} />}
            {detailTab === 1 && <StateFilterEditor roleId={selection.selected.id} readOnly={isReadOnly} actionsContainer={actionsContainer} />}
            {detailTab === 2 && <FieldGroupEditor roleId={selection.selected.id} readOnly={isReadOnly} actionsContainer={actionsContainer} />}
            {detailTab === 3 && <FieldGroupDefinitionEditor readOnly={isReadOnly} actionsContainer={actionsContainer} />}
          </Box>
        </Box>
      )}

      {/* ── View Details Dialog ──────────────────────────────────── */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start' }}>
          <Box>
            <span>Role Details</span>
            {viewRole && (
              <Typography variant="body2" color="text.secondary">
                {viewRole.name}
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
          {viewRole && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={detailGridSx}>
                <FieldRow label="Code" value={viewRole.code} />
                <FieldRow label="Name" value={viewRole.name} />
                <FieldRow label="Scope">
                  <StatusBadge status={viewRole.scope} />
                </FieldRow>
                <FieldRow label="System" value={viewRole.is_system ? 'Yes' : 'No'} />
                <FieldRow label="Immutable" value={viewRole.is_immutable ? 'Yes' : 'No'} />
                <FieldRow label="Created" value={fmtDate(viewRole.created_at)} />
                <FieldRow label="Updated" value={fmtDate(viewRole.updated_at)} />
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create Dialog ──────────────────────────────────────── */}
      <FormDialog
        open={createOpen}
        title="Create Role"
        submitLabel="Create"
        loading={createMut.isPending}
        onSubmit={handleCreate}
        onCancel={() => setCreateOpen(false)}
      >
        <TextField label="Code" required value={createForm.code} onChange={onCreateField('code')} inputProps={{ maxLength: 64 }} />
        <TextField label="Name" required value={createForm.name} onChange={onCreateField('name')} inputProps={{ maxLength: 128 }} />
        <TextField label="Description" value={createForm.description} onChange={onCreateField('description')} inputProps={{ maxLength: 255 }} />
        <TextField label="Scope" select value={createForm.scope} onChange={onCreateField('scope')}>
          {SCOPE_OPTS.map((s) => (
            <MenuItem key={s} value={s}>
              {cap(s)}
            </MenuItem>
          ))}
        </TextField>
      </FormDialog>

      {/* ── Edit Dialog ────────────────────────────────────────── */}
      <FormDialog
        open={editOpen}
        title="Edit Role"
        submitLabel="Save Changes"
        loading={updateMut.isPending}
        onSubmit={handleUpdate}
        onCancel={() => { setEditOpen(false); setEditRow(null); }}
      >
        {editRow && <TextField label="Code" value={editRow.code} disabled />}
        <TextField label="Name" required value={editForm.name} onChange={onEditField('name')} inputProps={{ maxLength: 128 }} />
        <TextField label="Description" value={editForm.description} onChange={onEditField('description')} inputProps={{ maxLength: 255 }} />
        <TextField label="Scope" select value={editForm.scope} onChange={onEditField('scope')}>
          {SCOPE_OPTS.map((s) => (
            <MenuItem key={s} value={s}>
              {cap(s)}
            </MenuItem>
          ))}
        </TextField>
      </FormDialog>

      {/* ── Snackbar ───────────────────────────────────────────── */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
