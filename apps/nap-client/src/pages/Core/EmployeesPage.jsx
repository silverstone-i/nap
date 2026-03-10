/**
 * @file Employees CRUD page — DataGrid + create/edit/archive/restore with is_app_user toggle
 * @module nap-client/pages/Core/EmployeesPage
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import { DataGrid } from '@mui/x-data-grid';

import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import ResetPasswordDialog from '../../components/shared/ResetPasswordDialog.jsx';
import SetPasswordPopover from '../../components/shared/SetPasswordPopover.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useEmployees, useCreateEmployee, useUpdateEmployee, useArchiveEmployee, useRestoreEmployee,
} from '../../hooks/useEmployees.js';
import { useRoles } from '../../hooks/useRoles.js';
import {
  usePhoneNumbers, useCreatePhoneNumber, useUpdatePhoneNumber, useArchivePhoneNumber,
} from '../../hooks/usePhoneNumbers.js';
import {
  useAddresses, useCreateAddress, useUpdateAddress, useArchiveAddress,
} from '../../hooks/useAddresses.js';
import {
  useTaxIdentifiers, useCreateTaxIdentifier, useUpdateTaxIdentifier, useArchiveTaxIdentifier,
} from '../../hooks/useTaxIdentifiers.js';
import { TAX_TYPES, COUNTRIES } from '@nap/shared';
import { pageContainerSx, formGridSx, formGroupCardSx, formFullSpanSx } from '../../config/layoutTokens.js';
import { buildBulkActions } from '../../utils/selectionUtils.js';
import { useDataGridSelection } from '../../hooks/useDataGridSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { resolveLevel } from '@nap/shared';

const BLANK_CREATE = {
  first_name: '', last_name: '', code: '', position: '', department: '', email: '',
  is_app_user: false, password: '', roles: [], is_primary_contact: false, is_billing_contact: false,
};
const BLANK_EDIT = {
  first_name: '', last_name: '', code: '', position: '', department: '', email: '',
  is_app_user: false, password: '', roles: [], is_primary_contact: false, is_billing_contact: false,
};

const PHONE_TYPES = ['cell', 'work', 'home', 'fax', 'other'];
const BLANK_PHONE = { phone_type: 'cell', phone_number: '', is_primary: false };
const BLANK_ADDRESS = {
  label: '', address_line_1: '', address_line_2: '', city: '',
  state_province: '', postal_code: '', country_code: '', is_primary: false,
};
const BLANK_TAX_ID = { country_code: 'US', tax_type: 'TIN', tax_value: '', is_primary: false };

const columns = [
  { field: 'code', headerName: 'Code', width: 100 },
  { field: 'first_name', headerName: 'First Name', width: 140 },
  { field: 'last_name', headerName: 'Last Name', width: 140 },
  { field: 'position', headerName: 'Position', width: 140 },
  { field: 'department', headerName: 'Department', width: 140 },
  { field: 'email', headerName: 'Email', flex: 1, minWidth: 200 },
  {
    field: 'roles',
    headerName: 'Roles',
    width: 160,
    valueGetter: (params) => (params.row.roles ?? []).join(', '),
  },
  {
    field: 'is_app_user',
    headerName: 'App User',
    width: 100,
    valueGetter: (params) => (params.row.is_app_user ? 'Yes' : 'No'),
  },
];

export default function EmployeesPage() {
  const { user } = useAuth();
  const caps = user?.perms?.caps || {};
  const canResetPassword = resolveLevel(caps, 'core', '', 'reset-password') === 'full';

  const { data: res, isLoading } = useEmployees();
  const allRows = res?.rows ?? [];

  const { data: rolesRes } = useRoles();
  const roleOptions = rolesRes?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateEmployee();
  const updateMut = useUpdateEmployee();
  const archiveMut = useArchiveEmployee();
  const restoreMut = useRestoreEmployee();

  const createPhoneMut = useCreatePhoneNumber();
  const updatePhoneMut = useUpdatePhoneNumber();
  const archivePhoneMut = useArchivePhoneNumber();
  const createAddrMut = useCreateAddress();
  const updateAddrMut = useUpdateAddress();
  const archiveAddrMut = useArchiveAddress();
  const createTaxIdMut = useCreateTaxIdentifier();
  const updateTaxIdMut = useUpdateTaxIdentifier();
  const archiveTaxIdMut = useArchiveTaxIdentifier();

  const { selectionModel, setSelectionModel, onSelectionChange, selectedRows, selected, isSingle, hasSelection, allActive, allArchived } =
    useDataGridSelection(rows);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [resetPwOpen, setResetPwOpen] = useState(false);

  const [editSourceId, setEditSourceId] = useState(null);
  const { data: phonesRes } = usePhoneNumbers({ source_id: editSourceId, includeDeactivated: 'false' }, { enabled: !!editSourceId });
  const { data: addressesRes } = useAddresses({ source_id: editSourceId, includeDeactivated: 'false' }, { enabled: !!editSourceId });
  const { data: taxIdsRes } = useTaxIdentifiers({ source_id: editSourceId, includeDeactivated: 'false' }, { enabled: !!editSourceId });

  const [createForm, setCreateForm] = useState(BLANK_CREATE);
  const [editForm, setEditForm] = useState(BLANK_EDIT);
  const [editPhones, setEditPhones] = useState([]);
  const [editAddresses, setEditAddresses] = useState([]);
  const [editTaxIds, setEditTaxIds] = useState([]);

  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  const onCreateField = (f) => (e) => setCreateForm((p) => ({ ...p, [f]: e.target.value }));
  const onEditField = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.value }));
  const onCreateCheck = (f) => (e) => setCreateForm((p) => ({ ...p, [f]: e.target.checked }));
  const onEditCheck = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.checked }));

  /* ── App-user password popover state ────────────────────────── */
  const [pwAnchor, setPwAnchor] = useState(null);
  const [pwTarget, setPwTarget] = useState(null); // 'create' | 'edit'

  const handleAppUserToggle = (target, setForm) => (e) => {
    if (e.target.checked) {
      setPwTarget(target);
      setPwAnchor(e.currentTarget);
    } else {
      setForm((p) => ({ ...p, is_app_user: false, password: '' }));
    }
  };

  const handlePwConfirm = (password) => {
    const setForm = pwTarget === 'create' ? setCreateForm : setEditForm;
    setForm((p) => ({ ...p, is_app_user: true, password }));
    setPwAnchor(null);
    setPwTarget(null);
  };

  const handlePwCancel = () => {
    setPwAnchor(null);
    setPwTarget(null);
  };

  /* ── Phone edit helpers ─────────────────────────────────────── */
  const updatePhone = (idx, field, value) =>
    setEditPhones((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  const addPhone = () => setEditPhones((prev) => [...prev, { ...BLANK_PHONE }]);
  const removePhone = (idx) =>
    setEditPhones((prev) => prev.map((p, i) => (i === idx ? { ...p, _deleted: true } : p)));

  /* ── Address edit helpers ───────────────────────────────────── */
  const updateAddress = (idx, field, value) =>
    setEditAddresses((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a)));
  const addAddress = () => setEditAddresses((prev) => [...prev, { ...BLANK_ADDRESS }]);
  const removeAddress = (idx) =>
    setEditAddresses((prev) => prev.map((a, i) => (i === idx ? { ...a, _deleted: true } : a)));

  /* ── Tax ID edit helpers ──────────────────────────────────── */
  const updateTaxId = (idx, field, value) =>
    setEditTaxIds((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  const addTaxId = () => setEditTaxIds((prev) => [...prev, { ...BLANK_TAX_ID }]);
  const removeTaxId = (idx) =>
    setEditTaxIds((prev) => prev.map((t, i) => (i === idx ? { ...t, _deleted: true } : t)));

  /* ── Sync query-fetched phones/addresses/taxIds into edit state */
  useEffect(() => {
    if (editOpen && phonesRes?.rows) setEditPhones(phonesRes.rows);
  }, [editOpen, phonesRes]);

  useEffect(() => {
    if (editOpen && addressesRes?.rows) setEditAddresses(addressesRes.rows);
  }, [editOpen, addressesRes]);

  useEffect(() => {
    if (editOpen && taxIdsRes?.rows) setEditTaxIds(taxIdsRes.rows);
  }, [editOpen, taxIdsRes]);

  const openEdit = useCallback(() => {
    if (!selected) return;
    setEditForm({
      first_name: selected.first_name ?? '',
      last_name: selected.last_name ?? '',
      code: selected.code ?? '',
      position: selected.position ?? '',
      department: selected.department ?? '',
      email: selected.email ?? '',
      is_app_user: !!selected.is_app_user,
      roles: selected.roles ?? [],
      is_primary_contact: !!selected.is_primary_contact,
      is_billing_contact: !!selected.is_billing_contact,
    });

    setEditSourceId(selected.source_id || null);
    if (!selected.source_id) {
      setEditPhones([]);
      setEditAddresses([]);
      setEditTaxIds([]);
    }

    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(createForm);
      toast('Employee created');
      setCreateOpen(false);
      setCreateForm(BLANK_CREATE);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      await updateMut.mutateAsync({ filter: { id: selected.id }, changes: editForm });

      if (selected.source_id) {
        for (const p of editPhones) {
          if (p._deleted && p.id) {
            await archivePhoneMut.mutateAsync({ id: p.id });
          } else if (!p.id && !p._deleted) {
            await createPhoneMut.mutateAsync({ source_id: selected.source_id, phone_type: p.phone_type, phone_number: p.phone_number, is_primary: p.is_primary });
          } else if (p.id && !p._deleted) {
            await updatePhoneMut.mutateAsync({ filter: { id: p.id }, changes: { phone_type: p.phone_type, phone_number: p.phone_number, is_primary: p.is_primary } });
          }
        }
        for (const a of editAddresses) {
          if (a._deleted && a.id) {
            await archiveAddrMut.mutateAsync({ id: a.id });
          } else if (!a.id && !a._deleted) {
            const { _deleted, ...rest } = a;
            await createAddrMut.mutateAsync({ ...rest, source_id: selected.source_id });
          } else if (a.id && !a._deleted) {
            const { id, source_id: _sid, created_at: _ca, updated_at: _ua, created_by: _cb, updated_by: _ub, deactivated_at: _da, ...changes } = a;
            await updateAddrMut.mutateAsync({ filter: { id }, changes });
          }
        }
        for (const t of editTaxIds) {
          if (t._deleted && t.id) {
            await archiveTaxIdMut.mutateAsync({ id: t.id });
          } else if (!t.id && !t._deleted) {
            await createTaxIdMut.mutateAsync({
              source_id: selected.source_id, country_code: t.country_code,
              tax_type: t.tax_type, tax_value: t.tax_value, is_primary: t.is_primary,
            });
          } else if (t.id && !t._deleted) {
            await updateTaxIdMut.mutateAsync({
              filter: { id: t.id },
              changes: { country_code: t.country_code, tax_type: t.tax_type, tax_value: t.tax_value, is_primary: t.is_primary },
            });
          }
        }
      }

      toast('Employee updated');
      setEditOpen(false);
      setEditSourceId(null);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const { setArchiveOpen, setRestoreOpen, archiveConfirmProps, restoreConfirmProps } = useArchiveRestore({
    selectedRows, archiveMut, restoreMut, entityName: 'employee', setSelectionModel, toast, errMsg,
    getLabel: (r) => `${r.first_name} ${r.last_name}`,
  });

  const toolbar = useMemo(
    () => ({
      tabs: [
        { value: 'active', label: 'Active', selected: viewFilter === 'active', onClick: () => { setViewFilter('active'); setSelectionModel([]); } },
        { value: 'all', label: 'All', selected: viewFilter === 'all', onClick: () => { setViewFilter('all'); setSelectionModel([]); } },
        { value: 'archived', label: 'Archived', selected: viewFilter === 'archived', onClick: () => { setViewFilter('archived'); setSelectionModel([]); } },
      ],
      filters: [],
      primaryActions: [
        { label: 'Create Employee', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
        { label: 'Edit', variant: 'outlined', disabled: !isSingle, onClick: openEdit },
        ...buildBulkActions({ selectedRows, hasSelection, allActive, allArchived, onArchive: () => setArchiveOpen(true), onRestore: () => setRestoreOpen(true) }),
      ],
    }),
    [isSingle, hasSelection, allActive, allArchived, selectedRows.length, viewFilter, openEdit, setSelectionModel, setArchiveOpen, setRestoreOpen],
  );
  useModuleToolbarRegistration(toolbar);

  /* ── Visible (non-deleted) sub-collections for the form ──── */
  const visiblePhones = editPhones.filter((p) => !p._deleted);
  const visibleAddresses = editAddresses.filter((a) => !a._deleted);
  const visibleTaxIds = editTaxIds.filter((t) => !t._deleted);

  return (
    <Box sx={pageContainerSx}>
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
        getRowClassName={(p) => (p.row.deactivated_at ? 'row-archived' : '')}
      />

      <FormDialog open={createOpen} title="Create Employee" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="First Name" required value={createForm.first_name} onChange={onCreateField('first_name')} />
        <TextField label="Last Name" required value={createForm.last_name} onChange={onCreateField('last_name')} />
        <TextField label="Code" value={createForm.code} onChange={onCreateField('code')} inputProps={{ maxLength: 16 }} />
        <TextField label="Position" value={createForm.position} onChange={onCreateField('position')} />
        <TextField label="Department" value={createForm.department} onChange={onCreateField('department')} />
        <TextField label="Email" type="email" value={createForm.email} onChange={onCreateField('email')} helperText={createForm.is_app_user && !createForm.email ? 'Email required for app users' : ''} error={createForm.is_app_user && !createForm.email} />
        <FormControlLabel control={<Checkbox checked={createForm.is_app_user} onChange={handleAppUserToggle('create', setCreateForm)} />} label="App User (creates login account)" />
        <Autocomplete
          multiple
          options={roleOptions}
          getOptionLabel={(opt) => opt.name}
          isOptionEqualToValue={(opt, val) => opt.code === val.code}
          value={roleOptions.filter((r) => createForm.roles.includes(r.code))}
          onChange={(_, v) => setCreateForm((p) => ({ ...p, roles: v.map((r) => r.code) }))}
          renderInput={(params) => <TextField {...params} label="Roles" />}
        />
        <FormControlLabel control={<Checkbox checked={createForm.is_primary_contact} onChange={onCreateCheck('is_primary_contact')} />} label="Primary Contact" />
        <FormControlLabel control={<Checkbox checked={createForm.is_billing_contact} onChange={onCreateCheck('is_billing_contact')} />} label="Billing Contact" />
      </FormDialog>

      {/* ── Edit Employee Dialog ─────────────────────────────── */}
      <FormDialog open={editOpen} title="Edit Employee" submitLabel="Save Changes" maxWidth="md" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => { setEditOpen(false); setEditSourceId(null); }}>
        <Box sx={formGridSx}>
          <TextField label="First Name" required value={editForm.first_name} onChange={onEditField('first_name')} />
          <TextField label="Last Name" required value={editForm.last_name} onChange={onEditField('last_name')} />
          <TextField label="Code" value={editForm.code} onChange={onEditField('code')} inputProps={{ maxLength: 16 }} />
          <TextField label="Position" value={editForm.position} onChange={onEditField('position')} />
          <TextField label="Department" value={editForm.department} onChange={onEditField('department')} />
          <TextField label="Email" type="email" value={editForm.email} onChange={onEditField('email')} helperText={editForm.is_app_user && !editForm.email ? 'Email required for app users' : ''} error={editForm.is_app_user && !editForm.email} />
          <FormControlLabel control={<Checkbox checked={editForm.is_app_user} onChange={handleAppUserToggle('edit', setEditForm)} />} label="App User (creates login account)" />
          <Autocomplete
            multiple
            options={roleOptions}
            getOptionLabel={(opt) => opt.name}
            isOptionEqualToValue={(opt, val) => opt.code === val.code}
            value={roleOptions.filter((r) => editForm.roles.includes(r.code))}
            onChange={(_, v) => setEditForm((p) => ({ ...p, roles: v.map((r) => r.code) }))}
            renderInput={(params) => <TextField {...params} label="Roles" />}
          />
          <FormControlLabel control={<Checkbox checked={editForm.is_primary_contact} onChange={onEditCheck('is_primary_contact')} />} label="Primary Contact" />
          <FormControlLabel control={<Checkbox checked={editForm.is_billing_contact} onChange={onEditCheck('is_billing_contact')} />} label="Billing Contact" />
        </Box>

        {editForm.is_app_user && canResetPassword && (
          <Button variant="outlined" size="small" onClick={() => setResetPwOpen(true)}>
            Reset Password
          </Button>
        )}

        {/* ── Phone Numbers ──────────────────────────────────── */}
        <Divider />
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2">Phone Numbers</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={addPhone}>Add Phone</Button>
        </Box>
        {visiblePhones.length === 0 && (
          <Typography variant="body2" color="text.secondary">No phone numbers</Typography>
        )}
        {visiblePhones.map((phone) => {
          const idx = editPhones.indexOf(phone);
          return (
            <Box key={phone.id || idx} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <TextField
                select
                label="Type"
                value={phone.phone_type}
                onChange={(e) => updatePhone(idx, 'phone_type', e.target.value)}
                sx={{ minWidth: 120 }}
                size="small"
              >
                {PHONE_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Number"
                value={phone.phone_number}
                onChange={(e) => updatePhone(idx, 'phone_number', e.target.value)}
                size="small"
                sx={{ flex: 1 }}
              />
              <FormControlLabel
                control={<Checkbox checked={phone.is_primary} onChange={(e) => updatePhone(idx, 'is_primary', e.target.checked)} size="small" />}
                label="Primary"
                sx={{ mr: 0 }}
              />
              <IconButton size="small" onClick={() => removePhone(idx)} color="error">
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Box>
          );
        })}

        {/* ── Addresses ──────────────────────────────────────── */}
        <Divider />
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2">Addresses</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={addAddress}>Add Address</Button>
        </Box>
        {visibleAddresses.length === 0 && (
          <Typography variant="body2" color="text.secondary">No addresses</Typography>
        )}
        {visibleAddresses.map((addr) => {
          const idx = editAddresses.indexOf(addr);
          return (
            <Box key={addr.id || idx} sx={{ ...formGroupCardSx, gridColumn: undefined }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <TextField
                  label="Label"
                  value={addr.label}
                  onChange={(e) => updateAddress(idx, 'label', e.target.value)}
                  size="small"
                  sx={{ width: 200 }}
                />
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <FormControlLabel
                    control={<Checkbox checked={addr.is_primary} onChange={(e) => updateAddress(idx, 'is_primary', e.target.checked)} size="small" />}
                    label="Primary"
                    sx={{ mr: 0 }}
                  />
                  <IconButton size="small" onClick={() => removeAddress(idx)} color="error">
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
              <Box sx={formGridSx}>
                <TextField label="Address Line 1" value={addr.address_line_1} onChange={(e) => updateAddress(idx, 'address_line_1', e.target.value)} size="small" sx={formFullSpanSx} />
                <TextField label="Address Line 2" value={addr.address_line_2} onChange={(e) => updateAddress(idx, 'address_line_2', e.target.value)} size="small" sx={formFullSpanSx} />
                <TextField label="City" value={addr.city} onChange={(e) => updateAddress(idx, 'city', e.target.value)} size="small" />
                <TextField label="State / Province" value={addr.state_province} onChange={(e) => updateAddress(idx, 'state_province', e.target.value)} size="small" />
                <TextField label="Postal Code" value={addr.postal_code} onChange={(e) => updateAddress(idx, 'postal_code', e.target.value)} size="small" />
                <TextField label="Country Code" value={addr.country_code} onChange={(e) => updateAddress(idx, 'country_code', e.target.value)} size="small" inputProps={{ maxLength: 2 }} />
              </Box>
            </Box>
          );
        })}

        {/* ── Tax Identifiers ──────────────────────────────────── */}
        <Divider />
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle2">Tax Identifiers</Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={addTaxId}>Add Tax ID</Button>
        </Box>
        {visibleTaxIds.length === 0 && (
          <Typography variant="body2" color="text.secondary">No tax identifiers</Typography>
        )}
        {visibleTaxIds.map((taxId) => {
          const idx = editTaxIds.indexOf(taxId);
          const countryCode = taxId.country_code?.trim() || '';
          const taxTypes = TAX_TYPES[countryCode] || TAX_TYPES._OTHER;
          return (
            <Box key={taxId.id || idx} sx={{ ...formGroupCardSx, gridColumn: undefined }}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <TextField
                  select
                  label="Country"
                  value={countryCode}
                  onChange={(e) => {
                    updateTaxId(idx, 'country_code', e.target.value);
                    const newTypes = TAX_TYPES[e.target.value] || TAX_TYPES._OTHER;
                    updateTaxId(idx, 'tax_type', newTypes[0]?.code || 'TIN');
                  }}
                  size="small"
                  sx={{ minWidth: 160 }}
                >
                  {COUNTRIES.map((c) => (
                    <MenuItem key={c.code} value={c.code}>{c.code} - {c.name}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Type"
                  value={taxId.tax_type}
                  onChange={(e) => updateTaxId(idx, 'tax_type', e.target.value)}
                  size="small"
                  sx={{ minWidth: 200 }}
                >
                  {taxTypes.map((t) => (
                    <MenuItem key={t.code} value={t.code}>{t.label}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Tax ID Value"
                  value={taxId.tax_value}
                  onChange={(e) => updateTaxId(idx, 'tax_value', e.target.value)}
                  placeholder={taxTypes.find((t) => t.code === taxId.tax_type)?.placeholder}
                  size="small"
                  sx={{ flex: 1, minWidth: 160 }}
                />
                <FormControlLabel
                  control={<Checkbox checked={taxId.is_primary} onChange={(e) => updateTaxId(idx, 'is_primary', e.target.checked)} size="small" />}
                  label="Primary"
                  sx={{ mr: 0 }}
                />
                <IconButton size="small" onClick={() => removeTaxId(idx)} color="error">
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
          );
        })}
      </FormDialog>

      <ConfirmDialog {...archiveConfirmProps} />
      <ConfirmDialog {...restoreConfirmProps} />

      <ResetPasswordDialog
        open={resetPwOpen}
        onClose={() => setResetPwOpen(false)}
        onSuccess={() => { setResetPwOpen(false); toast('Password reset successfully'); }}
        employeeId={selected?.id}
        employeeName={selected ? `${selected.first_name} ${selected.last_name}` : ''}
      />

      <SetPasswordPopover anchorEl={pwAnchor} onConfirm={handlePwConfirm} onCancel={handlePwCancel} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
