/**
 * @file Manage Roles page — master-detail layout with four-layer RBAC configuration
 * @module nap-client/pages/Tenant/ManageRolesPage
 *
 * Left panel: Roles DataGrid with create / edit.
 * Right panel: Detail panel with Policies, State Filters, and Field Groups tabs.
 *
 * Roles with is_immutable=true are read-only across all tabs.
 * Roles with is_system=true are visually distinguished.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';

import FormDialog from '../../components/shared/FormDialog.jsx';
import StatusBadge from '../../components/shared/StatusBadge.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import { useRoles, useCreateRole, useUpdateRole } from '../../hooks/useRoles.js';
import { masterDetailSx, masterPanelSx, detailPanelSx } from '../../config/layoutTokens.js';
import { useDataGridSelection } from '../../hooks/useDataGridSelection.js';

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
  const { selectionModel, onSelectionChange, selected, isSingle } = useDataGridSelection(rows);
  const isReadOnly = selected?.is_immutable || selected?.is_system;

  /* ── detail tab ────────────────────────────────────────────── */
  const [detailTab, setDetailTab] = useState(0);
  const [actionsContainer, setActionsContainer] = useState(null);

  /* ── dialog state ──────────────────────────────────────────── */
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

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

  const openEdit = useCallback(() => {
    if (!selected) return;
    setEditForm({
      name: selected.name ?? '',
      description: selected.description ?? '',
      scope: selected.scope ?? 'all_projects',
    });
    setEditOpen(true);
  }, [selected]);

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
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm });
      toast('Role updated');
      setEditOpen(false);
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
        {
          label: 'Edit',
          variant: 'outlined',
          disabled: !isSingle || !!selected?.is_immutable,
          onClick: openEdit,
        },
      ],
    }),
    [isSingle, selected, openEdit],
  );
  useModuleToolbarRegistration(toolbar);

  /* ── render ────────────────────────────────────────────────── */
  return (
    <Box sx={masterDetailSx}>
      {/* ── Left: Roles grid ──────────────────────────────────── */}
      <Box sx={isSingle ? { ...masterPanelSx } : { flex: 1, display: 'flex', flexDirection: 'column' }}>
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
        />
      </Box>

      {/* ── Right: Detail panel ───────────────────────────────── */}
      {isSingle && (
        <Box sx={detailPanelSx}>
          {/* Role header */}
          <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6">{selected.name}</Typography>
              {selected.is_system && <Chip label="System" size="small" color="info" />}
              {selected.is_immutable && <Chip label="Immutable" size="small" color="warning" />}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {selected.code} &middot; Scope: {cap(selected.scope)}
            </Typography>
            {selected.description && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {selected.description}
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
            {detailTab === 0 && <PolicyEditor roleId={selected.id} readOnly={isReadOnly} actionsContainer={actionsContainer} />}
            {detailTab === 1 && <StateFilterEditor roleId={selected.id} readOnly={isReadOnly} actionsContainer={actionsContainer} />}
            {detailTab === 2 && <FieldGroupEditor roleId={selected.id} readOnly={isReadOnly} actionsContainer={actionsContainer} />}
            {detailTab === 3 && <FieldGroupDefinitionEditor readOnly={isReadOnly} actionsContainer={actionsContainer} />}
          </Box>
        </Box>
      )}

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
        onCancel={() => setEditOpen(false)}
      >
        {selected && <TextField label="Code" value={selected.code} disabled />}
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
