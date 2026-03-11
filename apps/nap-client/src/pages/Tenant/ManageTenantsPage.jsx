/**
 * @file Manage Tenants page — DataTable list with CRUD dialogs
 * @module nap-client/pages/Tenant/ManageTenantsPage
 *
 * Implements PRD §3.2.1 UI: tenant grid, create / edit / view / archive / restore,
 * toolbar actions via useModuleToolbarRegistration, snackbar feedback.
 *
 * Adapted for pure identity nap_users — no tenant_role admin/billing contacts.
 *
 * Migrated to standardised list-view selection system:
 *   useListSelection + DataTable + ListToolbar + RowActionsMenu
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import FieldRow from '../../components/shared/FieldRow.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import DataTable from '../../components/shared/DataTable.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import PasswordField from '../../components/shared/PasswordField.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useTenants,
  useTenantContacts,
  useCreateTenant,
  useUpdateTenant,
  useArchiveTenant,
  useRestoreTenant,
} from '../../hooks/useTenants.js';
import { pageContainerSx } from '../../config/layoutTokens.js';
import { useListSelection } from '../../hooks/useListSelection.js';

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
  notes: '',
  admin_first_name: '',
  admin_last_name: '',
  admin_email: '',
  admin_password: '',
};

const BLANK_EDIT = {
  company: '',
  status: 'active',
  tier: 'starter',
  region: '',
  max_users: 5,
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

/* ── Detail dialog helpers ────────────────────────────────────── */

const detailGridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
  gap: 1.5,
};

const contactColumns = [
  {
    field: 'name',
    headerName: 'Name',
    flex: 1,
    minWidth: 150,
    valueGetter: (params) => `${params.row.first_name} ${params.row.last_name}`,
  },
  {
    field: 'email',
    headerName: 'Email',
    flex: 1,
    minWidth: 180,
    renderCell: (params) =>
      params.value ? (
        <Link href={`mailto:${params.value}`} underline="hover">
          {params.value}
        </Link>
      ) : (
        '\u2014'
      ),
  },
  {
    field: 'primary_phone',
    headerName: 'Phone',
    width: 150,
    valueGetter: (params) => params.row.primary_phone || '\u2014',
  },
];

/* ── Component ────────────────────────────────────────────────── */

export default function ManageTenantsPage() {
  /* ── queries ─────────────────────────────────────────────── */
  const { data: tenantRes, isLoading } = useTenants();
  const allRows = tenantRes?.rows ?? [];

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTenant, setDetailTenant] = useState(null);
  const { data: contactsData } = useTenantContacts(detailTenant?.id);

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

  /* ── selection (multi-select with root-tenant mutual exclusion) */
  const selection = useListSelection(rows, 'tenant');
  const { selectedRows, allActive, allArchived } = selection;

  /* ── dialog state ────────────────────────────────────────── */
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

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

  /* ── Row action callbacks ──────────────────────────────────── */
  const handleView = useCallback((row) => {
    setDetailTenant(row);
    setDetailOpen(true);
  }, []);

  const handleEdit = useCallback((row) => {
    setEditRow(row);
    setEditForm({
      company: row.company ?? '',
      status: row.status ?? 'active',
      tier: row.tier ?? 'starter',
      region: row.region ?? '',
      max_users: row.max_users ?? 5,
      notes: row.notes ?? '',
    });
    setEditOpen(true);
  }, []);

  /* ── CRUD handlers ───────────────────────────────────────── */
  const handleCreate = async () => {
    try {
      const payload = {
        ...createForm,
        tenant_code: createForm.tenant_code.toUpperCase(),
        max_users: Number(createForm.max_users) || 5,
      };
      await createMut.mutateAsync(payload);
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
        filter: { id: editRow.id },
        changes: { ...editForm, max_users: Number(editForm.max_users) || 5 },
      });
      toast('Tenant updated');
      setEditOpen(false);
      setEditRow(null);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleArchive = async () => {
    try {
      const targets = selectedRows.filter((r) => !r.deactivated_at);
      for (const row of targets) {
        await archiveMut.mutateAsync({ id: row.id });
      }
      toast(
        targets.length === 1
          ? 'Tenant archived \u2014 all users deactivated'
          : `${targets.length} tenants archived \u2014 all users deactivated`,
      );
      setArchiveOpen(false);
      selection.clearSelection();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleRestore = async () => {
    try {
      const targets = selectedRows.filter((r) => !!r.deactivated_at);
      for (const row of targets) {
        await restoreMut.mutateAsync({ id: row.id });
      }
      toast(
        targets.length === 1
          ? 'Tenant restored \u2014 users remain archived'
          : `${targets.length} tenants restored \u2014 users remain archived`,
      );
      setRestoreOpen(false);
      selection.clearSelection();
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  /* ── toolbar registration ────────────────────────────────── */
  const toolbar = useMemo(() => {
    const primary = [];

    if (viewFilter === 'active' || viewFilter === 'all') {
      primary.push({
        label: selectedRows.length > 1 ? `Archive (${selectedRows.length})` : 'Archive',
        variant: 'outlined',
        color: 'error',
        disabled: selectedRows.length === 0 || !allActive || selection.hasRootSelected,
        onClick: () => setArchiveOpen(true),
      });
    }
    if (viewFilter === 'archived' || viewFilter === 'all') {
      primary.push({
        label: selectedRows.length > 1 ? `Restore (${selectedRows.length})` : 'Restore',
        variant: 'outlined',
        color: 'success',
        disabled: selectedRows.length === 0 || !allArchived || selection.hasRootSelected,
        onClick: () => setRestoreOpen(true),
      });
    }

    primary.push({
      label: 'Create Tenant',
      variant: 'contained',
      color: 'primary',
      onClick: () => {
        setCreateForm(BLANK_CREATE);
        setCreateOpen(true);
      },
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
  }, [viewFilter, selectedRows.length, allActive, allArchived, selection.hasRootSelected, selection.clearSelection]);
  useModuleToolbarRegistration(toolbar);

  /* ── render ──────────────────────────────────────────────── */
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

      {/* ── View Details ───────────────────────────────────── */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start' }}>
          <Box>
            <span>Tenant Details</span>
            {detailTenant && (
              <Typography variant="body2" color="text.secondary">
                {detailTenant.company}
              </Typography>
            )}
          </Box>
          <Box sx={{ ml: 'auto' }}>
            <Button size="small" color="inherit" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {detailTenant && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* ── Tenant fields ─────────────────────────────── */}
              <Box sx={detailGridSx}>
                <FieldRow label="Code" value={detailTenant.tenant_code} />
                <FieldRow label="Tier" value={cap(detailTenant.tier)} />
                <FieldRow label="Region" value={detailTenant.region || '\u2014'} />
                <FieldRow label="Status">
                  <StatusBadge status={detailTenant.status} />
                </FieldRow>
                <FieldRow label="Max Users" value={detailTenant.max_users ?? '\u2014'} />
                <FieldRow label="Schema">
                  <Typography variant="body2" fontFamily="monospace">
                    {detailTenant.schema_name || '\u2014'}
                  </Typography>
                </FieldRow>
                <FieldRow label="Created" value={fmtDate(detailTenant.created_at)} />
                <FieldRow label="Updated" value={fmtDate(detailTenant.updated_at)} />
                <FieldRow label="Notes" value={detailTenant.notes || '\u2014'} sx={{ gridColumn: '1 / -1' }} />
              </Box>

              {/* ── Contacts ──────────────────────────────────── */}
              <Divider />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="overline" color="text.secondary">
                  Primary Contacts
                </Typography>
                {contactsData?.primary?.length ? (
                  <DataGrid
                    rows={contactsData.primary}
                    columns={contactColumns}
                    getRowId={(r) => r.id}
                    autoHeight
                    hideFooter
                    disableColumnMenu
                    disableRowSelectionOnClick
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No primary contacts
                  </Typography>
                )}
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="overline" color="text.secondary">
                  Billing Contacts
                </Typography>
                {contactsData?.billing?.length ? (
                  <DataGrid
                    rows={contactsData.billing}
                    columns={contactColumns}
                    getRowId={(r) => r.id}
                    autoHeight
                    hideFooter
                    disableColumnMenu
                    disableRowSelectionOnClick
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No billing contacts
                  </Typography>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
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
        <TextField
          label="Tenant Code"
          required
          value={createForm.tenant_code}
          onChange={(e) => setCreateForm((p) => ({ ...p, tenant_code: e.target.value.toUpperCase() }))}
          inputProps={{ maxLength: 6 }}
          helperText="Max 6 characters, auto-uppercased"
        />
        <TextField
          label="Company Name"
          required
          value={createForm.company}
          onChange={onCreateField('company')}
        />
        <TextField
          label="Status"
          select
          value={createForm.status}
          onChange={onCreateField('status')}
        >
          {STATUS_OPTS.map((s) => (
            <MenuItem key={s} value={s}>
              {cap(s)}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="Tier" select value={createForm.tier} onChange={onCreateField('tier')}>
          {TIER_OPTS.map((t) => (
            <MenuItem key={t} value={t}>
              {cap(t)}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="Region" value={createForm.region} onChange={onCreateField('region')} />
        <TextField
          label="Max Users"
          type="number"
          value={createForm.max_users}
          onChange={onCreateField('max_users')}
        />
        <TextField
          label="Notes"
          multiline
          minRows={2}
          value={createForm.notes}
          onChange={onCreateField('notes')}
        />

        <Divider sx={{ mt: 1 }} />
        <Typography variant="overline" color="text.secondary">
          Initial Admin User
        </Typography>
        <TextField
          label="First Name"
          required
          value={createForm.admin_first_name}
          onChange={onCreateField('admin_first_name')}
        />
        <TextField
          label="Last Name"
          required
          value={createForm.admin_last_name}
          onChange={onCreateField('admin_last_name')}
        />
        <TextField
          label="Admin Email"
          type="email"
          required
          value={createForm.admin_email}
          onChange={onCreateField('admin_email')}
        />
        <PasswordField
          label="Admin Password"
          required
          value={createForm.admin_password}
          onChange={onCreateField('admin_password')}
        />
      </FormDialog>

      {/* ── Edit Dialog ────────────────────────────────────── */}
      <FormDialog
        open={editOpen}
        title="Edit Tenant"
        submitLabel="Save Changes"
        loading={updateMut.isPending}
        onSubmit={handleUpdate}
        onCancel={() => { setEditOpen(false); setEditRow(null); }}
      >
        {editRow && (
          <>
            <TextField
              label="Tenant Code"
              value={editRow.tenant_code}
              disabled
              helperText="Cannot be changed after creation"
            />
            <TextField label="Schema Name" value={editRow.schema_name ?? ''} disabled />
          </>
        )}
        <TextField
          label="Company Name"
          required
          value={editForm.company}
          onChange={onEditField('company')}
        />
        <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
          {STATUS_OPTS.map((s) => (
            <MenuItem key={s} value={s}>
              {cap(s)}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="Tier" select value={editForm.tier} onChange={onEditField('tier')}>
          {TIER_OPTS.map((t) => (
            <MenuItem key={t} value={t}>
              {cap(t)}
            </MenuItem>
          ))}
        </TextField>
        <TextField label="Region" value={editForm.region} onChange={onEditField('region')} />
        <TextField
          label="Max Users"
          type="number"
          value={editForm.max_users}
          onChange={onEditField('max_users')}
        />
        <TextField
          label="Notes"
          multiline
          minRows={2}
          value={editForm.notes}
          onChange={onEditField('notes')}
        />
      </FormDialog>

      {/* ── Archive Confirmation ────────────────────────────── */}
      <ConfirmDialog
        open={archiveOpen}
        title="Archive Tenant"
        message={
          selection.hasSelection
            ? selectedRows.length === 1
              ? `Are you sure you want to archive "${selectedRows[0].company}" (${selectedRows[0].tenant_code})? All users belonging to this tenant will be deactivated.`
              : `Are you sure you want to archive ${selectedRows.length} tenants? All users belonging to these tenants will be deactivated.`
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
          selection.hasSelection
            ? selectedRows.length === 1
              ? `Restore "${selectedRows[0].company}" (${selectedRows[0].tenant_code})? Users will remain archived and must be restored individually.`
              : `Restore ${selectedRows.length} tenants? Users will remain archived and must be restored individually.`
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
