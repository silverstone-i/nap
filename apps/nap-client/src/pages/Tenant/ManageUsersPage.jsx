/**
 * @file Manage Users page — DataGrid list with register / edit / archive / restore
 * @module nap-client/pages/Tenant/ManageUsersPage
 *
 * Implements PRD §3.2.2 UI: user grid, register dialog with phones / addresses,
 * edit dialog (includes tenant_role: admin | billing | null), archive (prevents
 * self-archival and super_user archival), restore (warns if tenant inactive),
 * toolbar actions via useModuleToolbarRegistration, snackbar feedback.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { DataGrid } from '@mui/x-data-grid';

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import PasswordField from '../../components/shared/PasswordField.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import {
  useUsers,
  useUser,
  useRegisterUser,
  useUpdateUser,
  useArchiveUser,
  useRestoreUser,
} from '../../hooks/useUsers.js';
import {
  pageContainerSx,
  formGridSx,
  formFullSpanSx,
  formGroupCardSx,
  formSectionHeaderSx,
} from '../../config/layoutTokens.js';

/* ── Enums ────────────────────────────────────────────────────── */

const ROLE_OPTS = ['member', 'admin', 'super_user'];
const STATUS_OPTS = ['active', 'invited', 'locked'];
const TENANT_ROLE_OPTS = [
  { value: '', label: 'None' },
  { value: 'admin', label: 'Admin' },
  { value: 'billing', label: 'Billing' },
];
const PHONE_TYPE_OPTS = ['cell', 'home', 'work', 'fax', 'other'];
const ADDRESS_TYPE_OPTS = ['home', 'work', 'mailing', 'other'];

/* ── Empty form shapes ────────────────────────────────────────── */

const BLANK_REGISTER = {
  tenant_code: '',
  email: '',
  user_name: '',
  full_name: '',
  password: '',
  role: 'member',
  tenant_role: '',
  tax_id: '',
  notes: '',
};

const BLANK_PHONE = { phone_type: 'cell', phone_number: '', is_primary: false };

const BLANK_ADDRESS = {
  address_type: 'home',
  address_line_1: '',
  address_line_2: '',
  address_line_3: '',
  city: '',
  state_province: '',
  postal_code: '',
  country_code: '',
  is_primary: false,
};

const BLANK_EDIT = {
  user_name: '',
  full_name: '',
  role: 'member',
  status: 'active',
  tenant_role: '',
  tax_id: '',
  notes: '',
};

/* ── Helpers ──────────────────────────────────────────────────── */

const cap = (s) =>
  s ? s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '';

/* ── Column definitions ───────────────────────────────────────── */

const columns = [
  { field: 'email', headerName: 'Email', flex: 1, minWidth: 200 },
  { field: 'user_name', headerName: 'User Name', width: 150 },
  { field: 'full_name', headerName: 'Full Name', width: 160 },
  {
    field: 'role',
    headerName: 'Role',
    width: 120,
    renderCell: ({ value }) => <StatusBadge status={value} />,
  },
  {
    field: 'tenant_role',
    headerName: 'Tenant Role',
    width: 120,
    renderCell: ({ value }) => (value ? <StatusBadge status={value} /> : '\u2014'),
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 110,
    renderCell: ({ value }) => <StatusBadge status={value} />,
  },
  { field: 'tenant_code', headerName: 'Tenant', width: 100 },
  {
    field: 'deactivated_at',
    headerName: 'Active',
    width: 90,
    valueGetter: (params) => (params.row.deactivated_at ? 'No' : 'Yes'),
  },
];

/* ── Component ────────────────────────────────────────────────── */

export default function ManageUsersPage() {
  const { user: currentUser } = useAuth();

  /* ── queries ─────────────────────────────────────────────── */
  const { data: usersRes, isLoading } = useUsers();
  const allRows = usersRes?.rows ?? [];

  /* ── view filter ─────────────────────────────────────────── */
  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  /* ── mutations ───────────────────────────────────────────── */
  const registerMut = useRegisterUser();
  const updateMut = useUpdateUser();
  const archiveMut = useArchiveUser();
  const restoreMut = useRestoreUser();

  /* ── selection ───────────────────────────────────────────── */
  const [selectionModel, setSelectionModel] = useState([]);
  const selected = rows.find((r) => r.id === selectionModel[0]) ?? null;
  const isArchived = !!selected?.deactivated_at;
  const isSelf = selected?.id === currentUser?.id;
  const isSuperUser = selected?.role === 'super_user';

  /* ── dialog state ────────────────────────────────────────── */
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  /* ── form state ──────────────────────────────────────────── */
  const [regForm, setRegForm] = useState(BLANK_REGISTER);
  const [regPhones, setRegPhones] = useState([{ ...BLANK_PHONE }]);
  const [regAddresses, setRegAddresses] = useState([{ ...BLANK_ADDRESS }]);
  const [editForm, setEditForm] = useState(BLANK_EDIT);
  const [editPhones, setEditPhones] = useState([]);
  const [editAddresses, setEditAddresses] = useState([]);

  /* ── fetch single user (phones + addresses) for edit ────── */
  const [editUserId, setEditUserId] = useState(null);
  const { data: editUserData } = useUser(editUserId);

  /* ── snackbar ────────────────────────────────────────────── */
  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  /* ── field change factories ──────────────────────────────── */
  const onRegField = (f) => (e) => setRegForm((p) => ({ ...p, [f]: e.target.value }));
  const onEditField = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.value }));

  /* ── generic array-item field helpers ────────────────────── */
  const arrayFieldChange = (setter) => (idx, f) => (e) =>
    setter((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [f]: e.target.value };
      return next;
    });

  const arrayCheckChange = (setter) => (idx, f) => (e) =>
    setter((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [f]: e.target.checked };
      return next;
    });

  const arrayAdd = (setter, blank) => () => setter((p) => [...p, { ...blank }]);
  const arrayRemove = (setter) => (idx) => setter((p) => p.filter((_, i) => i !== idx));

  /* ── register phone handlers ────────────────────────────── */
  const onRegPhoneField = arrayFieldChange(setRegPhones);
  const onRegPhoneCheck = arrayCheckChange(setRegPhones);
  const addRegPhone = arrayAdd(setRegPhones, BLANK_PHONE);
  const removeRegPhone = arrayRemove(setRegPhones);

  /* ── register address handlers ──────────────────────────── */
  const onRegAddrField = arrayFieldChange(setRegAddresses);
  const onRegAddrCheck = arrayCheckChange(setRegAddresses);
  const addRegAddress = arrayAdd(setRegAddresses, BLANK_ADDRESS);
  const removeRegAddress = arrayRemove(setRegAddresses);

  /* ── edit phone handlers ────────────────────────────────── */
  const onEditPhoneField = arrayFieldChange(setEditPhones);
  const onEditPhoneCheck = arrayCheckChange(setEditPhones);
  const addEditPhone = arrayAdd(setEditPhones, BLANK_PHONE);
  const removeEditPhone = arrayRemove(setEditPhones);

  /* ── edit address handlers ──────────────────────────────── */
  const onEditAddrField = arrayFieldChange(setEditAddresses);
  const onEditAddrCheck = arrayCheckChange(setEditAddresses);
  const addEditAddress = arrayAdd(setEditAddresses, BLANK_ADDRESS);
  const removeEditAddress = arrayRemove(setEditAddresses);

  /* ── open edit → fetch user detail for phones / addresses ── */
  const openEdit = useCallback(() => {
    if (!selected) return;
    setEditForm({
      user_name: selected.user_name ?? '',
      full_name: selected.full_name ?? '',
      role: selected.role ?? 'member',
      status: selected.status ?? 'active',
      tenant_role: selected.tenant_role ?? '',
      tax_id: selected.tax_id ?? '',
      notes: selected.notes ?? '',
    });
    setEditUserId(selected.id);
    setEditOpen(true);
  }, [selected]);

  /* populate edit phones / addresses once the detail arrives */
  useEffect(() => {
    if (!editUserData) return;
    const phones = (editUserData.phones ?? []).map((p) => ({
      phone_type: p.phone_type ?? 'cell',
      phone_number: p.phone_number ?? '',
      is_primary: !!p.is_primary,
    }));
    setEditPhones(phones.length ? phones : [{ ...BLANK_PHONE }]);

    const addrs = (editUserData.addresses ?? []).map((a) => ({
      address_type: a.address_type ?? 'home',
      address_line_1: a.address_line_1 ?? '',
      address_line_2: a.address_line_2 ?? '',
      address_line_3: a.address_line_3 ?? '',
      city: a.city ?? '',
      state_province: a.state_province ?? '',
      postal_code: a.postal_code ?? '',
      country_code: a.country_code ?? '',
      is_primary: !!a.is_primary,
    }));
    setEditAddresses(addrs.length ? addrs : [{ ...BLANK_ADDRESS }]);
  }, [editUserData]);

  /* ── CRUD handlers ───────────────────────────────────────── */
  const handleRegister = async () => {
    try {
      const body = {
        ...regForm,
        tenant_code: regForm.tenant_code.toUpperCase(),
        tenant_role: regForm.tenant_role || null,
        phones: regPhones.filter((p) => p.phone_number),
        addresses: regAddresses.filter((a) => a.address_line_1),
      };
      await registerMut.mutateAsync(body);
      toast('User registered');
      setRegisterOpen(false);
      setRegForm(BLANK_REGISTER);
      setRegPhones([{ ...BLANK_PHONE }]);
      setRegAddresses([{ ...BLANK_ADDRESS }]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      const changes = {
        ...editForm,
        tenant_role: editForm.tenant_role || null,
        phones: editPhones.filter((p) => p.phone_number),
        addresses: editAddresses.filter((a) => a.address_line_1),
      };
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes });
      toast('User updated');
      setEditOpen(false);
      setEditUserId(null);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleArchive = async () => {
    try {
      await archiveMut.mutateAsync({ id: selected.id });
      toast('User archived');
      setArchiveOpen(false);
      setSelectionModel([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleRestore = async () => {
    try {
      await restoreMut.mutateAsync({ id: selected.id });
      toast('User restored');
      setRestoreOpen(false);
      setSelectionModel([]);
    } catch (err) {
      const msg = errMsg(err);
      toast(msg, msg?.includes('Tenant') ? 'warning' : 'error');
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
        {
          label: 'Register User',
          variant: 'contained',
          color: 'primary',
          onClick: () => { setRegForm(BLANK_REGISTER); setRegPhones([{ ...BLANK_PHONE }]); setRegAddresses([{ ...BLANK_ADDRESS }]); setRegisterOpen(true); },
        },
        { label: 'Edit User', variant: 'outlined', disabled: !selected, onClick: openEdit },
        { label: 'Archive', variant: 'outlined', color: 'error', disabled: !selected || isArchived || isSelf || isSuperUser, onClick: () => setArchiveOpen(true) },
        { label: 'Restore', variant: 'outlined', color: 'success', disabled: !selected || !isArchived, onClick: () => setRestoreOpen(true) },
      ],
    }),
    [selected, isArchived, isSelf, isSuperUser, viewFilter, openEdit],
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

      {/* ── Register Dialog ────────────────────────────────── */}
      <FormDialog
        open={registerOpen}
        title="Register User"
        maxWidth="md"
        submitLabel="Register"
        loading={registerMut.isPending}
        onSubmit={handleRegister}
        onCancel={() => setRegisterOpen(false)}
      >
        <Typography variant="subtitle2" color="text.secondary">Account</Typography>
        <Box sx={formGridSx}>
          <TextField label="Tenant Code" required value={regForm.tenant_code} onChange={onRegField('tenant_code')} inputProps={{ maxLength: 6 }} />
          <TextField label="Email" type="email" required value={regForm.email} onChange={onRegField('email')} />
          <TextField label="Username" required value={regForm.user_name} onChange={onRegField('user_name')} />
          <TextField label="Full Name" value={regForm.full_name} onChange={onRegField('full_name')} />
          <PasswordField label="Password" required value={regForm.password} onChange={onRegField('password')} />
          <TextField label="Role" select value={regForm.role} onChange={onRegField('role')}>
            {ROLE_OPTS.map((r) => <MenuItem key={r} value={r}>{cap(r)}</MenuItem>)}
          </TextField>
          <TextField label="Tenant Role" select value={regForm.tenant_role} onChange={onRegField('tenant_role')}>
            {TENANT_ROLE_OPTS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
          <TextField label="Tax ID" value={regForm.tax_id} onChange={onRegField('tax_id')} />
          <TextField label="Notes" multiline minRows={2} value={regForm.notes} onChange={onRegField('notes')} sx={formFullSpanSx} />
        </Box>

        <Divider />
        <Box sx={formSectionHeaderSx}>
          <Typography variant="subtitle2" color="text.secondary">Phone Numbers</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={addRegPhone}>Add Phone</Button>
        </Box>

        {regPhones.map((ph, idx) => (
          <Box key={idx} sx={formGroupCardSx}>
            {regPhones.length > 1 && (
              <IconButton size="small" onClick={() => removeRegPhone(idx)} sx={{ position: 'absolute', top: 4, right: 4 }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
            <TextField label="Phone Number" value={ph.phone_number} onChange={onRegPhoneField(idx, 'phone_number')} />
            <TextField label="Type" select value={ph.phone_type} onChange={onRegPhoneField(idx, 'phone_type')}>
              {PHONE_TYPE_OPTS.map((t) => <MenuItem key={t} value={t}>{cap(t)}</MenuItem>)}
            </TextField>
            <FormControlLabel
              control={<Checkbox checked={ph.is_primary} onChange={onRegPhoneCheck(idx, 'is_primary')} />}
              label="Primary phone"
            />
          </Box>
        ))}

        <Divider />
        <Box sx={formSectionHeaderSx}>
          <Typography variant="subtitle2" color="text.secondary">Addresses</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={addRegAddress}>Add Address</Button>
        </Box>

        {regAddresses.map((addr, idx) => (
          <Box key={idx} sx={formGroupCardSx}>
            {regAddresses.length > 1 && (
              <IconButton size="small" onClick={() => removeRegAddress(idx)} sx={{ position: 'absolute', top: 4, right: 4 }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
            <TextField label="Type" select value={addr.address_type} onChange={onRegAddrField(idx, 'address_type')}>
              {ADDRESS_TYPE_OPTS.map((t) => <MenuItem key={t} value={t}>{cap(t)}</MenuItem>)}
            </TextField>
            <TextField label="Address Line 1" value={addr.address_line_1} onChange={onRegAddrField(idx, 'address_line_1')} />
            <TextField label="Address Line 2" value={addr.address_line_2} onChange={onRegAddrField(idx, 'address_line_2')} />
            <TextField label="Address Line 3" value={addr.address_line_3} onChange={onRegAddrField(idx, 'address_line_3')} />
            <TextField label="City" value={addr.city} onChange={onRegAddrField(idx, 'city')} />
            <TextField label="State / Province" value={addr.state_province} onChange={onRegAddrField(idx, 'state_province')} />
            <TextField label="Postal Code" value={addr.postal_code} onChange={onRegAddrField(idx, 'postal_code')} />
            <TextField label="Country Code" value={addr.country_code} onChange={onRegAddrField(idx, 'country_code')} inputProps={{ maxLength: 2 }} />
            <FormControlLabel
              control={<Checkbox checked={addr.is_primary} onChange={onRegAddrCheck(idx, 'is_primary')} />}
              label="Primary address"
              sx={formFullSpanSx}
            />
          </Box>
        ))}
      </FormDialog>

      {/* ── Edit Dialog ────────────────────────────────────── */}
      <FormDialog
        open={editOpen}
        title="Edit User"
        maxWidth="md"
        submitLabel="Save Changes"
        loading={updateMut.isPending}
        onSubmit={handleUpdate}
        onCancel={() => { setEditOpen(false); setEditUserId(null); }}
      >
        <Typography variant="subtitle2" color="text.secondary">Account</Typography>
        <Box sx={formGridSx}>
          {selected && (
            <>
              <TextField label="Email" value={selected.email} disabled />
              <TextField label="Tenant" value={selected.tenant_code} disabled />
            </>
          )}
          <TextField label="Username" required value={editForm.user_name} onChange={onEditField('user_name')} />
          <TextField label="Full Name" value={editForm.full_name} onChange={onEditField('full_name')} />
          <TextField label="Role" select value={editForm.role} onChange={onEditField('role')}>
            {ROLE_OPTS.map((r) => <MenuItem key={r} value={r}>{cap(r)}</MenuItem>)}
          </TextField>
          <TextField label="Status" select value={editForm.status} onChange={onEditField('status')}>
            {STATUS_OPTS.map((s) => <MenuItem key={s} value={s}>{cap(s)}</MenuItem>)}
          </TextField>
          <TextField label="Tenant Role" select value={editForm.tenant_role} onChange={onEditField('tenant_role')} helperText="Admin or Billing contact for the tenant, or None">
            {TENANT_ROLE_OPTS.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
          <TextField label="Tax ID" value={editForm.tax_id} onChange={onEditField('tax_id')} />
          <TextField label="Notes" multiline minRows={2} value={editForm.notes} onChange={onEditField('notes')} sx={formFullSpanSx} />
        </Box>

        <Divider />
        <Box sx={formSectionHeaderSx}>
          <Typography variant="subtitle2" color="text.secondary">Phone Numbers</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={addEditPhone}>Add Phone</Button>
        </Box>

        {editPhones.map((ph, idx) => (
          <Box key={idx} sx={formGroupCardSx}>
            {editPhones.length > 1 && (
              <IconButton size="small" onClick={() => removeEditPhone(idx)} sx={{ position: 'absolute', top: 4, right: 4 }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
            <TextField label="Phone Number" value={ph.phone_number} onChange={onEditPhoneField(idx, 'phone_number')} />
            <TextField label="Type" select value={ph.phone_type} onChange={onEditPhoneField(idx, 'phone_type')}>
              {PHONE_TYPE_OPTS.map((t) => <MenuItem key={t} value={t}>{cap(t)}</MenuItem>)}
            </TextField>
            <FormControlLabel
              control={<Checkbox checked={ph.is_primary} onChange={onEditPhoneCheck(idx, 'is_primary')} />}
              label="Primary phone"
            />
          </Box>
        ))}

        <Divider />
        <Box sx={formSectionHeaderSx}>
          <Typography variant="subtitle2" color="text.secondary">Addresses</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={addEditAddress}>Add Address</Button>
        </Box>

        {editAddresses.map((addr, idx) => (
          <Box key={idx} sx={formGroupCardSx}>
            {editAddresses.length > 1 && (
              <IconButton size="small" onClick={() => removeEditAddress(idx)} sx={{ position: 'absolute', top: 4, right: 4 }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            )}
            <TextField label="Type" select value={addr.address_type} onChange={onEditAddrField(idx, 'address_type')}>
              {ADDRESS_TYPE_OPTS.map((t) => <MenuItem key={t} value={t}>{cap(t)}</MenuItem>)}
            </TextField>
            <TextField label="Address Line 1" value={addr.address_line_1} onChange={onEditAddrField(idx, 'address_line_1')} />
            <TextField label="Address Line 2" value={addr.address_line_2} onChange={onEditAddrField(idx, 'address_line_2')} />
            <TextField label="Address Line 3" value={addr.address_line_3} onChange={onEditAddrField(idx, 'address_line_3')} />
            <TextField label="City" value={addr.city} onChange={onEditAddrField(idx, 'city')} />
            <TextField label="State / Province" value={addr.state_province} onChange={onEditAddrField(idx, 'state_province')} />
            <TextField label="Postal Code" value={addr.postal_code} onChange={onEditAddrField(idx, 'postal_code')} />
            <TextField label="Country Code" value={addr.country_code} onChange={onEditAddrField(idx, 'country_code')} inputProps={{ maxLength: 2 }} />
            <FormControlLabel
              control={<Checkbox checked={addr.is_primary} onChange={onEditAddrCheck(idx, 'is_primary')} />}
              label="Primary address"
              sx={formFullSpanSx}
            />
          </Box>
        ))}
      </FormDialog>

      {/* ── Archive Confirmation ────────────────────────────── */}
      <ConfirmDialog
        open={archiveOpen}
        title="Archive User"
        message={
          selected
            ? `Are you sure you want to archive "${selected.email}"? They will no longer be able to log in.`
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
        title="Restore User"
        message={
          selected
            ? `Restore "${selected.email}"? If the parent tenant is inactive this will be rejected by the server.`
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
