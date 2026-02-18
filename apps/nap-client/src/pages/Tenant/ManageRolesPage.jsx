/**
 * @file Manage Roles page — RBAC role management with members and policies
 * @module nap-client/pages/Tenant/ManageRolesPage
 *
 * Three-area layout:
 *   Left  — Roles DataGrid (CRUD)
 *   Right — Detail panel with Members and Policies tabs (shown on single select)
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Autocomplete from '@mui/material/Autocomplete';
import { DataGrid } from '@mui/x-data-grid';

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useRoles,
  useCreateRole,
  useUpdateRole,
  useArchiveRole,
  useRestoreRole,
  useRoleMembers,
  useSyncRoleMembers,
  useRemoveRoleMember,
  usePolicies,
  useSyncPolicies,
  usePolicyCatalog,
} from '../../hooks/useRbac.js';
import { useUsers } from '../../hooks/useUsers.js';
import { pageContainerSx, formGridSx } from '../../config/layoutTokens.js';
import { deriveSelectionState } from '../../utils/selectionUtils.js';

/* ── Enums ────────────────────────────────────────────────────── */

const SCOPE_OPTS = [
  { value: 'all_projects', label: 'All Projects' },
  { value: 'assigned_companies', label: 'Assigned Companies' },
  { value: 'assigned_projects', label: 'Assigned Projects' },
];

const LEVEL_OPTS = [
  { value: '', label: '\u2014' },
  { value: 'none', label: 'None' },
  { value: 'view', label: 'View' },
  { value: 'full', label: 'Full' },
];

/* ── Empty form shapes ────────────────────────────────────────── */

const BLANK_ROLE = {
  code: '',
  name: '',
  description: '',
  scope: 'all_projects',
};

/* ── Helpers ──────────────────────────────────────────────────── */

const cap = (s) =>
  s ? s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '';

/**
 * Build a tree structure from flat catalog entries for the policy editor.
 * Groups by module → router → action.
 */
function buildCatalogTree(catalogRows) {
  const modules = new Map();

  for (const entry of catalogRows) {
    if (!modules.has(entry.module)) {
      modules.set(entry.module, { label: entry.label, routers: new Map() });
    }
    const mod = modules.get(entry.module);

    if (entry.router === null && entry.action === null) {
      // Module-level entry — update label
      mod.label = entry.label;
      continue;
    }

    if (!mod.routers.has(entry.router)) {
      mod.routers.set(entry.router, { label: entry.label, actions: [] });
    }
    const rtr = mod.routers.get(entry.router);

    if (entry.action === null) {
      // Router-level entry — update label
      rtr.label = entry.label;
    } else {
      rtr.actions.push({ action: entry.action, label: entry.label });
    }
  }

  return modules;
}

/**
 * Build a lookup key for a policy: module::router::action
 */
function policyKey(module, router, action) {
  return `${module}::${router || ''}::${action || ''}`;
}

/* ── Roles column definitions ─────────────────────────────────── */

const rolesColumns = [
  { field: 'code', headerName: 'Code', width: 140 },
  { field: 'name', headerName: 'Name', flex: 1, minWidth: 160 },
  {
    field: 'scope',
    headerName: 'Scope',
    width: 160,
    renderCell: ({ value }) => <StatusBadge status={value} />,
  },
  {
    field: 'is_system',
    headerName: 'System',
    width: 80,
    renderCell: ({ value }) => (value ? <Chip label="Yes" size="small" color="info" /> : ''),
  },
  {
    field: 'deactivated_at',
    headerName: 'Active',
    width: 80,
    valueGetter: (params) => (params.row.deactivated_at ? 'No' : 'Yes'),
  },
];

/* ── Members column definitions ───────────────────────────────── */

const membersColumns = [
  { field: 'user_name', headerName: 'User Name', width: 150 },
  { field: 'email', headerName: 'Email', flex: 1, minWidth: 200 },
  { field: 'full_name', headerName: 'Full Name', width: 160 },
  {
    field: 'is_primary',
    headerName: 'Primary',
    width: 80,
    renderCell: ({ value }) => (value ? <Chip label="Yes" size="small" color="primary" /> : ''),
  },
];

/* ── Component ────────────────────────────────────────────────── */

export default function ManageRolesPage() {
  /* ── queries ─────────────────────────────────────────────── */
  const { data: rolesRes, isLoading: rolesLoading } = useRoles();
  const allRoles = rolesRes?.rows ?? [];

  const { data: usersRes } = useUsers();
  const allUsers = usersRes?.rows ?? [];

  /* ── view filter ─────────────────────────────────────────── */
  const [viewFilter, setViewFilter] = useState('active');
  const roles = useMemo(() => {
    if (viewFilter === 'active') return allRoles.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRoles.filter((r) => !!r.deactivated_at);
    return allRoles;
  }, [allRoles, viewFilter]);

  /* ── mutations ───────────────────────────────────────────── */
  const createMut = useCreateRole();
  const updateMut = useUpdateRole();
  const archiveMut = useArchiveRole();
  const restoreMut = useRestoreRole();
  const syncMembersMut = useSyncRoleMembers();
  const removeMemberMut = useRemoveRoleMember();
  const syncPoliciesMut = useSyncPolicies();

  /* ── role selection ──────────────────────────────────────── */
  const [selectionModel, setSelectionModel] = useState([]);
  const { selectedRows, selected, isSingle, hasSelection, allActive, allArchived } =
    deriveSelectionState(selectionModel, roles, 'role');

  /* ── detail panel state ──────────────────────────────────── */
  const [detailTab, setDetailTab] = useState(0);

  /* ── members data ────────────────────────────────────────── */
  const { data: membersRes } = useRoleMembers(selected?.id);
  const memberRows = useMemo(() => {
    const records = membersRes?.records ?? [];
    // Enrich with user info
    return records.map((m) => {
      const user = allUsers.find((u) => u.id === m.user_id);
      return {
        ...m,
        user_name: user?.user_name ?? '',
        email: user?.email ?? '',
        full_name: user?.full_name ?? '',
      };
    });
  }, [membersRes, allUsers]);

  const [memberSelection, setMemberSelection] = useState([]);

  /* ── policies data ───────────────────────────────────────── */
  const { data: policiesRes } = usePolicies(selected?.id);
  const currentPolicies = useMemo(() => policiesRes?.records ?? [], [policiesRes?.records]);

  const { data: catalogRes } = usePolicyCatalog();
  const catalogRows = catalogRes?.rows ?? [];
  const catalogTree = useMemo(() => buildCatalogTree(catalogRows), [catalogRows]);

  // Policy editor state: map of "module::router::action" → level
  const [policyEdits, setPolicyEdits] = useState({});
  const [policiesDirty, setPoliciesDirty] = useState(false);

  // Reset policy edits when selected role changes
  useEffect(() => {
    if (!selected?.id) {
      setPolicyEdits({});
      setPoliciesDirty(false);
      return;
    }
    const map = {};
    for (const p of currentPolicies) {
      map[policyKey(p.module, p.router, p.action)] = p.level;
    }
    setPolicyEdits(map);
    setPoliciesDirty(false);
  }, [selected?.id, currentPolicies]);

  // Reset member selection when role changes
  useEffect(() => {
    setMemberSelection([]);
  }, [selected?.id]);

  /* ── dialog state ────────────────────────────────────────── */
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);

  /* ── form state ──────────────────────────────────────────── */
  const [roleForm, setRoleForm] = useState(BLANK_ROLE);
  const [addMemberUser, setAddMemberUser] = useState(null);

  /* ── snackbar ────────────────────────────────────────────── */
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  /* ── field change helpers ────────────────────────────────── */
  const onField = (f) => (e) => setRoleForm((p) => ({ ...p, [f]: e.target.value }));

  /* ── open edit ───────────────────────────────────────────── */
  const openEdit = useCallback(() => {
    if (!selected) return;
    setRoleForm({
      code: selected.code ?? '',
      name: selected.name ?? '',
      description: selected.description ?? '',
      scope: selected.scope ?? 'all_projects',
    });
    setEditOpen(true);
  }, [selected]);

  /* ── CRUD handlers ───────────────────────────────────────── */
  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(roleForm);
      toast('Role created');
      setCreateOpen(false);
      setRoleForm(BLANK_ROLE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes: roleForm });
      toast('Role updated');
      setEditOpen(false);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleArchive = async () => {
    try {
      for (const row of selectedRows.filter((r) => !r.deactivated_at)) {
        await archiveMut.mutateAsync({ id: row.id });
      }
      toast(selectedRows.length === 1 ? 'Role archived' : `${selectedRows.length} roles archived`);
      setArchiveOpen(false);
      setSelectionModel([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleRestore = async () => {
    try {
      for (const row of selectedRows.filter((r) => !!r.deactivated_at)) {
        await restoreMut.mutateAsync({ id: row.id });
      }
      toast(selectedRows.length === 1 ? 'Role restored' : `${selectedRows.length} roles restored`);
      setRestoreOpen(false);
      setSelectionModel([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  /* ── member handlers ─────────────────────────────────────── */
  const handleAddMember = async () => {
    if (!addMemberUser || !selected?.id) return;
    try {
      const currentUserIds = memberRows.map((m) => m.user_id);
      await syncMembersMut.mutateAsync({
        role_id: selected.id,
        user_ids: [...currentUserIds, addMemberUser.id],
      });
      toast('Member added');
      setAddMemberOpen(false);
      setAddMemberUser(null);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleRemoveMembers = async () => {
    if (!selected?.id || !memberSelection.length) return;
    try {
      for (const memberId of memberSelection) {
        const member = memberRows.find((m) => m.id === memberId);
        if (member) {
          await removeMemberMut.mutateAsync({ role_id: selected.id, user_id: member.user_id });
        }
      }
      toast(memberSelection.length === 1 ? 'Member removed' : `${memberSelection.length} members removed`);
      setMemberSelection([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  // Users not already in the role (for the add member autocomplete)
  const availableUsers = useMemo(() => {
    const memberUserIds = new Set(memberRows.map((m) => m.user_id));
    return allUsers.filter((u) => !memberUserIds.has(u.id) && !u.deactivated_at);
  }, [allUsers, memberRows]);

  /* ── policy handlers ─────────────────────────────────────── */
  const handlePolicyChange = (key, level) => {
    setPolicyEdits((prev) => {
      const next = { ...prev };
      if (level === '') {
        delete next[key];
      } else {
        next[key] = level;
      }
      return next;
    });
    setPoliciesDirty(true);
  };

  const handleSavePolicies = async () => {
    if (!selected?.id) return;
    try {
      const policies = Object.entries(policyEdits).map(([key, level]) => {
        const [module, router, action] = key.split('::');
        return {
          module,
          router: router || null,
          action: action || null,
          level,
        };
      });
      await syncPoliciesMut.mutateAsync({ role_id: selected.id, policies });
      toast('Policies saved');
      setPoliciesDirty(false);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  /* ── toolbar registration ────────────────────────────────── */
  const canArchive = hasSelection && allActive && !selectedRows.some((r) => r.is_system);
  const canEdit = isSingle && !selected?.is_immutable;

  const toolbar = useMemo(
    () => ({
      tabs: [
        { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
        { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
        { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
      ],
      filters: [],
      primaryActions: [
        {
          label: 'Create Role',
          variant: 'contained',
          color: 'primary',
          onClick: () => { setRoleForm(BLANK_ROLE); setCreateOpen(true); },
        },
        { label: 'Edit Role', variant: 'outlined', disabled: !canEdit, onClick: openEdit },
        {
          label: selectedRows.length > 1 ? `Archive (${selectedRows.length})` : 'Archive',
          variant: 'outlined',
          color: 'error',
          disabled: !canArchive,
          onClick: () => setArchiveOpen(true),
        },
        {
          label: selectedRows.length > 1 ? `Restore (${selectedRows.length})` : 'Restore',
          variant: 'outlined',
          color: 'success',
          disabled: !hasSelection || !allArchived,
          onClick: () => setRestoreOpen(true),
        },
      ],
    }),
    [canEdit, canArchive, hasSelection, allArchived, selectedRows.length, viewFilter, openEdit],
  );
  useModuleToolbarRegistration(toolbar);

  /* ── render ──────────────────────────────────────────────── */
  return (
    <Box sx={{ ...pageContainerSx, flexDirection: 'row', gap: 2 }}>
      {/* ── Left: Roles grid ──────────────────────────────────── */}
      <Box sx={{ flex: isSingle ? '0 0 420px' : 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <DataGrid
          rows={roles}
          columns={rolesColumns}
          getRowId={(r) => r.id}
          loading={rolesLoading}
          checkboxSelection
          rowSelectionModel={selectionModel}
          onRowSelectionModelChange={setSelectionModel}
          pageSizeOptions={[25, 50, 100]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          getRowClassName={(params) => (params.row.deactivated_at ? 'row-archived' : '')}
        />
      </Box>

      {/* ── Right: Detail panel ───────────────────────────────── */}
      {isSingle && (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            {selected.name}
            {selected.is_system && <Chip label="System" size="small" color="info" sx={{ ml: 1 }} />}
            {selected.is_immutable && <Chip label="Immutable" size="small" color="warning" sx={{ ml: 1 }} />}
          </Typography>
          {selected.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {selected.description}
            </Typography>
          )}
          <Typography variant="body2" sx={{ mb: 2 }}>
            Scope: <StatusBadge status={selected.scope} />
          </Typography>

          <Tabs value={detailTab} onChange={(_, v) => setDetailTab(v)} sx={{ mb: 1 }}>
            <Tab label="Members" />
            <Tab label="Policies" />
          </Tabs>

          {/* ── Members Tab ─────────────────────────────────────── */}
          {detailTab === 0 && (
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  onClick={() => { setAddMemberUser(null); setAddMemberOpen(true); }}
                >
                  Add Member
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  disabled={!memberSelection.length}
                  onClick={handleRemoveMembers}
                >
                  {memberSelection.length > 1 ? `Remove (${memberSelection.length})` : 'Remove'}
                </Button>
              </Box>
              <DataGrid
                rows={memberRows}
                columns={membersColumns}
                getRowId={(r) => r.id}
                checkboxSelection
                rowSelectionModel={memberSelection}
                onRowSelectionModelChange={setMemberSelection}
                pageSizeOptions={[10, 25]}
                initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
                autoHeight
              />
            </Box>
          )}

          {/* ── Policies Tab ────────────────────────────────────── */}
          {detailTab === 1 && (
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
                <Button
                  size="small"
                  variant="contained"
                  disabled={!policiesDirty || syncPoliciesMut.isPending}
                  onClick={handleSavePolicies}
                >
                  {syncPoliciesMut.isPending ? 'Saving...' : 'Save Policies'}
                </Button>
              </Box>

              {[...catalogTree.entries()].map(([moduleName, mod]) => (
                <Box key={moduleName} sx={{ mb: 2 }}>
                  {/* Module-level row */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, py: 0.5, bgcolor: 'action.hover', px: 1, borderRadius: 1 }}>
                    <Typography variant="subtitle2" sx={{ flex: 1 }}>
                      {mod.label}
                    </Typography>
                    <TextField
                      select
                      size="small"
                      value={policyEdits[policyKey(moduleName, null, null)] ?? ''}
                      onChange={(e) => handlePolicyChange(policyKey(moduleName, null, null), e.target.value)}
                      sx={{ width: 100 }}
                    >
                      {LEVEL_OPTS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                    </TextField>
                  </Box>

                  {/* Router-level rows */}
                  {[...mod.routers.entries()].map(([routerName, rtr]) => (
                    <Box key={routerName} sx={{ ml: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25, py: 0.25, px: 1 }}>
                        <Typography variant="body2" sx={{ flex: 1 }}>
                          {rtr.label}
                        </Typography>
                        <TextField
                          select
                          size="small"
                          value={policyEdits[policyKey(moduleName, routerName, null)] ?? ''}
                          onChange={(e) => handlePolicyChange(policyKey(moduleName, routerName, null), e.target.value)}
                          sx={{ width: 100 }}
                        >
                          {LEVEL_OPTS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                        </TextField>
                      </Box>

                      {/* Action-level rows */}
                      {rtr.actions.map((act) => (
                        <Box key={act.action} sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 2, mb: 0.25, py: 0.25, px: 1 }}>
                          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                            {act.label}
                          </Typography>
                          <TextField
                            select
                            size="small"
                            value={policyEdits[policyKey(moduleName, routerName, act.action)] ?? ''}
                            onChange={(e) => handlePolicyChange(policyKey(moduleName, routerName, act.action), e.target.value)}
                            sx={{ width: 100 }}
                          >
                            {LEVEL_OPTS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
                          </TextField>
                        </Box>
                      ))}
                    </Box>
                  ))}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* ── Create Role Dialog ──────────────────────────────── */}
      <FormDialog
        open={createOpen}
        title="Create Role"
        maxWidth="sm"
        submitLabel="Create"
        loading={createMut.isPending}
        onSubmit={handleCreate}
        onCancel={() => setCreateOpen(false)}
      >
        <Box sx={formGridSx}>
          <TextField label="Code" required value={roleForm.code} onChange={onField('code')} inputProps={{ maxLength: 64 }} />
          <TextField label="Name" required value={roleForm.name} onChange={onField('name')} inputProps={{ maxLength: 128 }} />
          <TextField label="Scope" select value={roleForm.scope} onChange={onField('scope')}>
            {SCOPE_OPTS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
          <TextField
            label="Description"
            multiline
            minRows={2}
            value={roleForm.description}
            onChange={onField('description')}
            sx={{ gridColumn: '1 / -1' }}
          />
        </Box>
      </FormDialog>

      {/* ── Edit Role Dialog ───────────────────────────────── */}
      <FormDialog
        open={editOpen}
        title="Edit Role"
        maxWidth="sm"
        submitLabel="Save Changes"
        loading={updateMut.isPending}
        onSubmit={handleUpdate}
        onCancel={() => setEditOpen(false)}
      >
        <Box sx={formGridSx}>
          <TextField label="Code" required value={roleForm.code} onChange={onField('code')} inputProps={{ maxLength: 64 }} />
          <TextField label="Name" required value={roleForm.name} onChange={onField('name')} inputProps={{ maxLength: 128 }} />
          <TextField label="Scope" select value={roleForm.scope} onChange={onField('scope')}>
            {SCOPE_OPTS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
          <TextField
            label="Description"
            multiline
            minRows={2}
            value={roleForm.description}
            onChange={onField('description')}
            sx={{ gridColumn: '1 / -1' }}
          />
        </Box>
      </FormDialog>

      {/* ── Add Member Dialog ──────────────────────────────── */}
      <FormDialog
        open={addMemberOpen}
        title="Add Member"
        maxWidth="sm"
        submitLabel="Add"
        loading={syncMembersMut.isPending}
        submitDisabled={!addMemberUser}
        onSubmit={handleAddMember}
        onCancel={() => setAddMemberOpen(false)}
      >
        <Autocomplete
          options={availableUsers}
          getOptionLabel={(u) => `${u.user_name} (${u.email})`}
          value={addMemberUser}
          onChange={(_, val) => setAddMemberUser(val)}
          renderInput={(params) => <TextField {...params} label="Select User" />}
        />
      </FormDialog>

      {/* ── Archive Confirmation ─────────────────────────────── */}
      <ConfirmDialog
        open={archiveOpen}
        title="Archive Role"
        message={
          hasSelection
            ? selectedRows.length === 1
              ? `Are you sure you want to archive the "${selectedRows[0].name}" role?`
              : `Are you sure you want to archive ${selectedRows.length} roles?`
            : ''
        }
        confirmLabel="Archive"
        confirmColor="error"
        loading={archiveMut.isPending}
        onConfirm={handleArchive}
        onCancel={() => setArchiveOpen(false)}
      />

      {/* ── Restore Confirmation ─────────────────────────────── */}
      <ConfirmDialog
        open={restoreOpen}
        title="Restore Role"
        message={
          hasSelection
            ? selectedRows.length === 1
              ? `Restore the "${selectedRows[0].name}" role?`
              : `Restore ${selectedRows.length} roles?`
            : ''
        }
        confirmLabel="Restore"
        confirmColor="success"
        loading={restoreMut.isPending}
        onConfirm={handleRestore}
        onCancel={() => setRestoreOpen(false)}
      />

      {/* ── Snackbar ────────────────────────────────────────── */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snack.sev}
          variant="filled"
          onClose={() => setSnack((s) => ({ ...s, open: false }))}
        >
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
}
