/**
 * @file Manage Tenants page — DataGrid list with CRUD dialogs
 * @module nap-client/pages/Tenant/ManageTenantsPage
 *
 * Implements PRD §3.2.1 UI: tenant grid, create / edit / view / archive / restore,
 * toolbar actions via useModuleToolbarRegistration, snackbar feedback.
 * Admin and billing contacts derived from nap_users.tenant_role — shown
 * read-only in the View Details dialog.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import PasswordField from '../../components/shared/PasswordField.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useTenants,
  useCreateTenant,
  useUpdateTenant,
  useArchiveTenant,
  useRestoreTenant,
} from '../../hooks/useTenants.js';
import { useUsers } from '../../hooks/useUsers.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

/* ── Enums ────────────────────────────────────────────────────── */

const STATUS_OPTS = ['active', 'trial', 'suspended', 'pending'];
const TIER_OPTS = ['starter', 'growth', 'enterprise'];

/* ── Empty form shapes ────────────────────────────────────────── */

const BLANK_CREATE = {
  tenant_code: '',
  company: '',
  status: 'active',
  tier: 'starter',
  region: '',
  max_users: 5,
  billing_email: '',
  notes: '',
  admin_email: '',
  admin_user_name: '',
  admin_password: '',
};

const BLANK_EDIT = {
  company: '',
  status: 'active',
  tier: 'starter',
  region: '',
  max_users: 5,
  billing_email: '',
  notes: '',
};

/* ── Helpers ──────────────────────────────────────────────────── */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

/* ── Column definitions ───────────────────────────────────────── */

const columns = [
  { field: 'tenant_code', headerName: 'Code', width: 100 },
  { field: 'company', headerName: 'Tenant Name', flex: 1, minWidth: 180 },
  {
    field: 'status',
    headerName: 'Status',
    width: 120,
    renderCell: ({ value }) => <StatusBadge status={value} />,
  },
  {
    field: 'tier',
    headerName: 'Tier',
    width: 120,
    valueGetter: (params) => cap(params.row.tier),
  },
  { field: 'region', headerName: 'Region', width: 130 },
  {
    field: 'deactivated_at',
    headerName: 'Active',
    width: 90,
    valueGetter: (params) => (params.row.deactivated_at ? 'No' : 'Yes'),
  },
];

/* ── Component ────────────────────────────────────────────────── */

export default function ManageTenantsPage() {
  /* ── queries ─────────────────────────────────────────────── */
  const { data: tenantRes, isLoading } = useTenants();
  const allRows = tenantRes?.rows ?? [];

  const { data: usersRes } = useUsers();
  const allUsers = usersRes?.rows ?? [];

  /* ── view filter (Active / All / Archived) ───────────────── */
  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  /* ── mutations ───────────────────────────────────────────── */
  const createMut = useCreateTenant();
  const updateMut = useUpdateTenant();
  const archiveMut = useArchiveTenant();
  const restoreMut = useRestoreTenant();

  /* ── selection ───────────────────────────────────────────── */
  const [selectionModel, setSelectionModel] = useState([]);
  const selected = rows.find((r) => r.id === selectionModel[0]) ?? null;
  const isArchived = !!selected?.deactivated_at;

  /* ── dialog state ────────────────────────────────────────── */
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTenant, setDetailTenant] = useState(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  /* ── derived admin / billing users for a given tenant ────── */
  const contactsFor = useCallback(
    (tenant) => {
      if (!tenant) return { admin: null, billing: null };
      return {
        admin: allUsers.find(
          (u) => u.tenant_code === tenant.tenant_code && u.tenant_role === 'admin',
        ) ?? null,
        billing: allUsers.find(
          (u) => u.tenant_code === tenant.tenant_code && u.tenant_role === 'billing',
        ) ?? null,
      };
    },
    [allUsers],
  );
  const { admin: detailAdmin, billing: detailBilling } = contactsFor(detailTenant);
  const { admin: adminUser, billing: billingUser } = contactsFor(selected);

  /* ── form state ──────────────────────────────────────────── */
  const [createForm, setCreateForm] = useState(BLANK_CREATE);
  const [editForm, setEditForm] = useState(BLANK_EDIT);

  /* ── snackbar ────────────────────────────────────────────── */
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  /* ── field change factories ──────────────────────────────── */
  const onCreateField = (f) => (e) => setCreateForm((p) => ({ ...p, [f]: e.target.value }));
  const onEditField = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.value }));

  const openEdit = useCallback(() => {
    if (!selected) return;
    setEditForm({
      company: selected.company ?? '',
      status: selected.status ?? 'active',
      tier: selected.tier ?? 'starter',
      region: selected.region ?? '',
      max_users: selected.max_users ?? 5,
      billing_email: selected.billing_email ?? '',
      notes: selected.notes ?? '',
    });
    setEditOpen(true);
  }, [selected]);

  /* ── CRUD handlers ───────────────────────────────────────── */
  const handleCreate = async () => {
    try {
      await createMut.mutateAsync({
        ...createForm,
        tenant_code: createForm.tenant_code.toUpperCase(),
        max_users: Number(createForm.max_users) || 5,
      });
      toast('Tenant created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({
        filter: { id: selected.id },
        changes: { ...editForm, max_users: Number(editForm.max_users) || 5 },
      });
      toast('Tenant updated');
      setEditOpen(false);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleArchive = async () => {
    try {
      await archiveMut.mutateAsync({ id: selected.id });
      toast('Tenant archived — users deactivated');
      setArchiveOpen(false);
      setSelectionModel([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleRestore = async () => {
    try {
      await restoreMut.mutateAsync({ id: selected.id });
      toast('Tenant restored — users reactivated');
      setRestoreOpen(false);
      setSelectionModel([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  /* ── toolbar registration ────────────────────────────────── */
  const toolbar = useMemo(
    () => ({
      tabs: [
        { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
        { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
        { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
      ],
      filters: [],
      primaryActions: [
        { label: 'Create Tenant', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
        { label: 'View Details', variant: 'outlined', disabled: !selected, onClick: () => { setDetailTenant(selected); setDetailOpen(true); } },
        { label: 'Edit Tenant', variant: 'outlined', disabled: !selected, onClick: openEdit },
        { label: 'Archive', variant: 'outlined', color: 'error', disabled: !selected || isArchived, onClick: () => setArchiveOpen(true) },
        { label: 'Restore', variant: 'outlined', color: 'success', disabled: !selected || !isArchived, onClick: () => setRestoreOpen(true) },
      ],
    }),
    [selected, isArchived, viewFilter, openEdit],
  );
  useModuleToolbarRegistration(toolbar);

  /* ── render ──────────────────────────────────────────────── */
  return (
    <Box sx={pageContainerSx}>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        loading={isLoading}
        checkboxSelection
        disableMultipleRowSelection
        rowSelectionModel={selectionModel}
        onRowSelectionModelChange={setSelectionModel}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        getRowClassName={(params) => (params.row.deactivated_at ? 'row-archived' : '')}
      />

      {/* ── View Details ───────────────────────────────────── */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Tenant Details</DialogTitle>
        <DialogContent dividers>
          {detailTenant && (
            <Grid container spacing={2}>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">Code</Typography>
                <Typography>{detailTenant.tenant_code}</Typography>
              </Grid>
              <Grid item xs={8}>
                <Typography variant="caption" color="text.secondary">Company</Typography>
                <Typography>{detailTenant.company}</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">Status</Typography>
                <Box mt={0.5}><StatusBadge status={detailTenant.status} /></Box>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">Tier</Typography>
                <Typography>{cap(detailTenant.tier)}</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">Region</Typography>
                <Typography>{detailTenant.region || '\u2014'}</Typography>
              </Grid>
              <Grid item xs={4}>
                <Typography variant="caption" color="text.secondary">Max Users</Typography>
                <Typography>{detailTenant.max_users ?? '\u2014'}</Typography>
              </Grid>
              <Grid item xs={8}>
                <Typography variant="caption" color="text.secondary">Billing Email</Typography>
                <Typography>{detailTenant.billing_email || '\u2014'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Schema</Typography>
                <Typography variant="body2" fontFamily="monospace">{detailTenant.schema_name || '\u2014'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Active</Typography>
                <Typography>{detailTenant.deactivated_at ? 'No' : 'Yes'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Created</Typography>
                <Typography>{fmtDate(detailTenant.created_at)}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Updated</Typography>
                <Typography>{fmtDate(detailTenant.updated_at)}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="caption" color="text.secondary">Notes</Typography>
                <Typography>{detailTenant.notes || '\u2014'}</Typography>
              </Grid>

              <Grid item xs={12}><Divider /></Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary">Assigned Users</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Admin</Typography>
                <Typography>{detailAdmin ? `${detailAdmin.email} (${detailAdmin.user_name})` : '\u2014'}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Billing</Typography>
                <Typography>{detailBilling ? `${detailBilling.email} (${detailBilling.user_name})` : '\u2014'}</Typography>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Create Dialog ──────────────────────────────────── */}
      <FormDialog
        open={createOpen}
        title="Create Tenant"
        submitLabel="Create"
        loading={createMut.isPending}
        onSubmit={handleCreate}
        onCancel={() => setCreateOpen(false)}
      >
        <TextField label="Tenant Code" required value={createForm.tenant_code} onChange={onCreateField('tenant_code')} inputProps={{ maxLength: 6 }} helperText="Max 6 characters, auto-uppercased" />
        <TextField label="Company Name" required value={createForm.company} onChange={onCreateField('company')} />
        <TextField label="Status" select value={createForm.status} onChange={onCreateField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Tier" select value={createForm.tier} onChange={onCreateField('tier')}>
          {TIER_OPTS.map((t) => <MenuItem key={t} value={t}>{cap(t)}</MenuItem>)}
        </TextField>
        <TextField label="Region" value={createForm.region} onChange={onCreateField('region')} />
        <TextField label="Max Users" type="number" value={createForm.max_users} onChange={onCreateField('max_users')} />
        <TextField label="Billing Email" type="email" value={createForm.billing_email} onChange={onCreateField('billing_email')} />
        <TextField label="Notes" multiline minRows={2} value={createForm.notes} onChange={onCreateField('notes')} />

        <Divider />
        <Typography variant="subtitle2" color="text.secondary">Initial Admin User</Typography>
        <TextField label="Admin Email" type="email" required value={createForm.admin_email} onChange={onCreateField('admin_email')} />
        <TextField label="Admin Username" required value={createForm.admin_user_name} onChange={onCreateField('admin_user_name')} />
        <PasswordField label="Admin Password" required value={createForm.admin_password} onChange={onCreateField('admin_password')} />
      </FormDialog>

      {/* ── Edit Dialog ────────────────────────────────────── */}
      <FormDialog
        open={editOpen}
        title="Edit Tenant"
        submitLabel="Save Changes"
        loading={updateMut.isPending}
        onSubmit={handleUpdate}
        onCancel={() => setEditOpen(false)}
      >
        {selected && (
          <>
            <TextField label="Tenant Code" value={selected.tenant_code} disabled helperText="Cannot be changed after creation" />
            <TextField label="Schema Name" value={selected.schema_name ?? ''} disabled />
          </>
        )}
        <TextField label="Company Name" required value={editForm.company} onChange={onEditField('company')} />
        <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
          {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
        </TextField>
        <TextField label="Tier" select value={editForm.tier} onChange={onEditField('tier')}>
          {TIER_OPTS.map((t) => <MenuItem key={t} value={t}>{cap(t)}</MenuItem>)}
        </TextField>
        <TextField label="Region" value={editForm.region} onChange={onEditField('region')} />
        <TextField label="Max Users" type="number" value={editForm.max_users} onChange={onEditField('max_users')} />
        <TextField label="Billing Email" type="email" value={editForm.billing_email} onChange={onEditField('billing_email')} />
        <TextField label="Notes" multiline minRows={2} value={editForm.notes} onChange={onEditField('notes')} />

        <Divider />
        <Typography variant="subtitle2" color="text.secondary">Assigned Users (read-only)</Typography>
        <TextField label="Admin User" value={adminUser ? `${adminUser.email} (${adminUser.user_name})` : '\u2014 None assigned'} disabled />
        <TextField label="Billing User" value={billingUser ? `${billingUser.email} (${billingUser.user_name})` : '\u2014 None assigned'} disabled />
      </FormDialog>

      {/* ── Archive Confirmation ────────────────────────────── */}
      <ConfirmDialog
        open={archiveOpen}
        title="Archive Tenant"
        message={
          selected
            ? `Are you sure you want to archive "${selected.company}" (${selected.tenant_code})? All users belonging to this tenant will be deactivated.`
            : ''
        }
        confirmLabel="Archive"
        confirmColor="error"
        loading={archiveMut.isPending}
        onConfirm={handleArchive}
        onCancel={() => setArchiveOpen(false)}
      />

      {/* ── Restore Confirmation ────────────────────────────── */}
      <ConfirmDialog
        open={restoreOpen}
        title="Restore Tenant"
        message={
          selected
            ? `Restore "${selected.company}" (${selected.tenant_code})? All previously deactivated users will be reactivated.`
            : ''
        }
        confirmLabel="Restore"
        confirmColor="success"
        loading={restoreMut.isPending}
        onConfirm={handleRestore}
        onCancel={() => setRestoreOpen(false)}
      />

      {/* ── Snackbar ───────────────────────────────────────── */}
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
