/**
 * @file Employees CRUD page — DataTable + create/edit/view/archive/restore with is_app_user toggle
 * @module nap-client/pages/Core/EmployeesPage
 *
 * Migrated to standardised list-view selection system:
 *   useListSelection + DataTable + RowActionsMenu
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
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
import LockResetIcon from '@mui/icons-material/LockReset';

import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import DataTable from '../../components/shared/DataTable.jsx';
import FieldRow from '../../components/shared/FieldRow.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import ImportDialog from '../../components/shared/ImportDialog.jsx';
import PatternTextField from '../../components/shared/PatternTextField.jsx';
import ResetPasswordDialog from '../../components/shared/ResetPasswordDialog.jsx';
import SetPasswordPopover from '../../components/shared/SetPasswordPopover.jsx';
import StatusBadge from '../../components/shared/StatusBadge.jsx';
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
import { useImportXls, useExportXls } from '../../hooks/useImportExport.js';
import { TAX_TYPES, COUNTRIES } from '@nap/shared';
import { employeeApi } from '../../services/employeeApi.js';
import { pageContainerSx, formGridSx, formGroupCardSx, formFullSpanSx, dialogHeaderSx, dialogActionBoxSx, detailGridSx } from '../../config/layoutTokens.js';
import { useListSelection } from '../../hooks/useListSelection.js';
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
const BLANK_PHONE = { country_code: 'US', phone_type: 'cell', phone_number: '', is_primary: false };
const BLANK_ADDRESS = {
  label: '', address_line_1: '', address_line_2: '', city: '',
  state_province: '', postal_code: '', country_code: 'US', is_primary: false,
};
const BLANK_TAX_ID = { country_code: 'US', tax_type: 'TIN', tax_value: '', is_primary: false };

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

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
  const canImport = resolveLevel(caps, 'core', 'employees', 'import') === 'full';
  const canExport = resolveLevel(caps, 'core', 'employees', 'export') !== 'none';

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

  const importMut = useImportXls(employeeApi.importXls, ['employees']);
  const exportMut = useExportXls(employeeApi.exportXls, 'employees');

  const createPhoneMut = useCreatePhoneNumber();
  const updatePhoneMut = useUpdatePhoneNumber();
  const archivePhoneMut = useArchivePhoneNumber();
  const createAddrMut = useCreateAddress();
  const updateAddrMut = useUpdateAddress();
  const archiveAddrMut = useArchiveAddress();
  const createTaxIdMut = useCreateTaxIdentifier();
  const updateTaxIdMut = useUpdateTaxIdentifier();
  const archiveTaxIdMut = useArchiveTaxIdentifier();

  /* ── Selection (new system) ─────────────────────────────────── */
  const selection = useListSelection(rows);
  const { selectedRows, allActive, allArchived } = selection;

  /* ── Dialog state ───────────────────────────────────────────── */
  const [importOpen, setImportOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewEmployee, setViewEmployee] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [resetPwOpen, setResetPwOpen] = useState(false);
  const [resetPwTarget, setResetPwTarget] = useState(null);

  const [editSourceId, setEditSourceId] = useState(null);
  const { data: phonesRes } = usePhoneNumbers({ source_id: editSourceId, includeDeactivated: 'false' }, { enabled: !!editSourceId });
  const { data: addressesRes } = useAddresses({ source_id: editSourceId, includeDeactivated: 'false' }, { enabled: !!editSourceId });
  const { data: taxIdsRes } = useTaxIdentifiers({ source_id: editSourceId, includeDeactivated: 'false' }, { enabled: !!editSourceId });

  const [createForm, setCreateForm] = useState(BLANK_CREATE);
  const [editForm, setEditForm] = useState(BLANK_EDIT);
  const [editPhones, setEditPhones] = useState([]);
  const [editAddresses, setEditAddresses] = useState([]);
  const [editTaxIds, setEditTaxIds] = useState([]);
  const editInitial = useRef({ form: null, phones: null, addresses: null, taxIds: null });

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
    if (editOpen && phonesRes?.rows) {
      setEditPhones(phonesRes.rows);
      editInitial.current.phones = phonesRes.rows;
    }
  }, [editOpen, phonesRes]);

  useEffect(() => {
    if (editOpen && addressesRes?.rows) {
      setEditAddresses(addressesRes.rows);
      editInitial.current.addresses = addressesRes.rows;
    }
  }, [editOpen, addressesRes]);

  useEffect(() => {
    if (editOpen && taxIdsRes?.rows) {
      setEditTaxIds(taxIdsRes.rows);
      editInitial.current.taxIds = taxIdsRes.rows;
    }
  }, [editOpen, taxIdsRes]);

  /* ── Row action callbacks ──────────────────────────────────── */
  const handleView = useCallback((row) => {
    setViewEmployee(row);
    setViewOpen(true);
  }, []);

  const handleEdit = useCallback((row) => {
    setEditRow(row);
    const form = {
      first_name: row.first_name ?? '',
      last_name: row.last_name ?? '',
      code: row.code ?? '',
      position: row.position ?? '',
      department: row.department ?? '',
      email: row.email ?? '',
      is_app_user: !!row.is_app_user,
      roles: row.roles ?? [],
      is_primary_contact: !!row.is_primary_contact,
      is_billing_contact: !!row.is_billing_contact,
    };
    setEditForm(form);
    editInitial.current.form = form;

    setEditSourceId(row.source_id || null);
    if (!row.source_id) {
      setEditPhones([]);
      setEditAddresses([]);
      setEditTaxIds([]);
      editInitial.current.phones = [];
      editInitial.current.addresses = [];
      editInitial.current.taxIds = [];
    }

    setEditOpen(true);
  }, []);

  /** Per-row kebab actions — Reset Password shown for app users when permitted */
  const getRowActions = useCallback(
    (row) => {
      const actions = [];
      if (row.is_app_user && canResetPassword) {
        actions.push({
          label: 'Reset Password',
          icon: <LockResetIcon fontSize="small" />,
          onClick: (r) => {
            setResetPwTarget(r);
            setResetPwOpen(true);
          },
        });
      }
      return actions;
    },
    [canResetPassword],
  );

  /* ── Dirty-check: disable Save when nothing changed ──────── */
  const hasEditChanges = useMemo(() => {
    const init = editInitial.current;
    if (!init.form) return false;
    // Form fields
    if (JSON.stringify(editForm) !== JSON.stringify(init.form)) return true;
    // Collections — any addition, deletion, or field change counts
    const collectionChanged = (current, initial, fields) => {
      if (!initial) return false;
      if (current.some((c) => c._deleted)) return true;
      if (current.some((c) => !c.id && !c._deleted)) return true;
      const initMap = new Map(initial.map((r) => [r.id, r]));
      return current.filter((c) => c.id && !c._deleted).some((c) => {
        const orig = initMap.get(c.id);
        return !orig || fields.some((f) => c[f] !== orig[f]);
      });
    };
    if (collectionChanged(editPhones, init.phones, ['country_code', 'phone_type', 'phone_number', 'is_primary'])) return true;
    if (collectionChanged(editAddresses, init.addresses, ['label', 'address_line_1', 'address_line_2', 'city', 'state_province', 'postal_code', 'country_code', 'is_primary'])) return true;
    if (collectionChanged(editTaxIds, init.taxIds, ['country_code', 'tax_type', 'tax_value', 'is_primary'])) return true;
    return false;
  }, [editForm, editPhones, editAddresses, editTaxIds]);

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
      await updateMut.mutateAsync({ filter: { id: editRow.id }, changes: editForm });

      if (editRow.source_id) {
        for (const p of editPhones) {
          if (p._deleted && p.id) {
            await archivePhoneMut.mutateAsync({ id: p.id });
          } else if (!p.id && !p._deleted) {
            await createPhoneMut.mutateAsync({ source_id: editRow.source_id, phone_type: p.phone_type, phone_number: p.phone_number, is_primary: p.is_primary });
          } else if (p.id && !p._deleted) {
            await updatePhoneMut.mutateAsync({ filter: { id: p.id }, changes: { phone_type: p.phone_type, phone_number: p.phone_number, is_primary: p.is_primary } });
          }
        }
        for (const a of editAddresses) {
          if (a._deleted && a.id) {
            await archiveAddrMut.mutateAsync({ id: a.id });
          } else if (!a.id && !a._deleted) {
            const { _deleted, ...rest } = a;
            await createAddrMut.mutateAsync({ ...rest, source_id: editRow.source_id });
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
              source_id: editRow.source_id, country_code: t.country_code,
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
      setEditRow(null);
      setEditSourceId(null);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleImport = useCallback(async (formData) => {
    try {
      const result = await importMut.mutateAsync(formData);
      toast(`Imported ${result.inserted} records`);
      setImportOpen(false);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  }, [importMut.mutateAsync, toast]);

  const handleExport = useCallback(async () => {
    try {
      await exportMut.mutateAsync({});
      toast('Export downloaded');
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  }, [exportMut.mutateAsync, toast]);

  const { setArchiveOpen, setRestoreOpen, archiveConfirmProps, restoreConfirmProps } = useArchiveRestore({
    selectedRows,
    archiveMut,
    restoreMut,
    entityName: 'employee',
    setSelectionModel: () => selection.clearSelection(),
    toast,
    errMsg,
    getLabel: (r) => `${r.first_name} ${r.last_name}`,
  });

  /* ── ModuleBar: tabs + Create + Archive/Restore ────────────── */
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

    if (canExport) {
      primary.push({
        label: 'Export',
        variant: 'outlined',
        disabled: exportMut.isPending,
        onClick: handleExport,
      });
    }
    if (canImport) {
      primary.push({
        label: 'Import',
        variant: 'outlined',
        onClick: () => setImportOpen(true),
      });
    }

    primary.push({
      label: 'Create Employee',
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
  }, [viewFilter, selectedRows.length, allActive, allArchived, selection.clearSelection, setArchiveOpen, setRestoreOpen, canImport, canExport, exportMut.isPending, handleExport]);
  useModuleToolbarRegistration(toolbar);

  /* ── Visible (non-deleted) sub-collections for the form ──── */
  const visiblePhones = editPhones.filter((p) => !p._deleted);
  const visibleAddresses = editAddresses.filter((a) => !a._deleted);
  const visibleTaxIds = editTaxIds.filter((t) => !t._deleted);

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
      />

      {/* ── View Details Dialog ──────────────────────────────────── */}
      <Dialog open={viewOpen} onClose={() => setViewOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={dialogHeaderSx}>
          <Box>
            <span>Employee Details</span>
            {viewEmployee && (
              <Typography variant="body2" color="text.secondary">
                {viewEmployee.first_name} {viewEmployee.last_name}
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
          {viewEmployee && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Box sx={detailGridSx}>
                <FieldRow label="Code" value={viewEmployee.code || '\u2014'} />
                <FieldRow label="First Name" value={viewEmployee.first_name} />
                <FieldRow label="Last Name" value={viewEmployee.last_name} />
                <FieldRow label="Position" value={viewEmployee.position || '\u2014'} />
                <FieldRow label="Department" value={viewEmployee.department || '\u2014'} />
                <FieldRow label="Email" value={viewEmployee.email || '\u2014'} />
                <FieldRow label="App User" value={viewEmployee.is_app_user ? 'Yes' : 'No'} />
                <FieldRow label="Roles" value={(viewEmployee.roles ?? []).join(', ') || '\u2014'} />
                <FieldRow label="Status">
                  <StatusBadge status={viewEmployee.deactivated_at ? 'archived' : 'active'} />
                </FieldRow>
                <FieldRow label="Primary Contact" value={viewEmployee.is_primary_contact ? 'Yes' : 'No'} />
                <FieldRow label="Billing Contact" value={viewEmployee.is_billing_contact ? 'Yes' : 'No'} />
                <FieldRow label="Created" value={fmtDate(viewEmployee.created_at)} />
                <FieldRow label="Updated" value={fmtDate(viewEmployee.updated_at)} />
              </Box>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create Employee Dialog ───────────────────────────────── */}
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
      <FormDialog open={editOpen} title="Edit Employee" submitLabel="Save Changes" maxWidth="md" loading={updateMut.isPending} submitDisabled={!hasEditChanges} onSubmit={handleUpdate} onCancel={() => { setEditOpen(false); setEditRow(null); setEditSourceId(null); }}>
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
          <Button variant="outlined" size="small" onClick={() => { setResetPwTarget(editRow); setResetPwOpen(true); }}>
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
          const countryCode = phone.country_code?.trim() || 'US';
          const country = COUNTRIES.find((c) => c.code === countryCode);
          return (
            <Box key={phone.id || idx} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <TextField
                select
                label="Type"
                value={phone.phone_type}
                onChange={(e) => updatePhone(idx, 'phone_type', e.target.value)}
                sx={{ minWidth: 120 }}
                size="small"
              >
                {PHONE_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>{cap(t)}</MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Country"
                value={countryCode}
                onChange={(e) => updatePhone(idx, 'country_code', e.target.value)}
                SelectProps={{ renderValue: (val) => COUNTRIES.find((c) => c.code === val)?.dial_code || val }}
                sx={{ minWidth: 80 }}
                size="small"
              >
                {COUNTRIES.map((c) => (
                  <MenuItem key={c.code} value={c.code}>{c.dial_code} {c.code} - {c.name}</MenuItem>
                ))}
              </TextField>
              <PatternTextField
                label="Number"
                value={phone.phone_number}
                onChange={(raw) => updatePhone(idx, 'phone_number', raw)}
                pattern={country?.placeholder}
                size="small"
                sx={{ flex: 1, minWidth: 160 }}
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
                  SelectProps={{ renderValue: (val) => val }}
                  size="small"
                  sx={{ minWidth: 80 }}
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
                  SelectProps={{ renderValue: (val) => val }}
                  size="small"
                  sx={{ minWidth: 80 }}
                >
                  {taxTypes.map((t) => (
                    <MenuItem key={t.code} value={t.code}>{t.label}</MenuItem>
                  ))}
                </TextField>
                <PatternTextField
                  label="Tax ID Value"
                  value={taxId.tax_value}
                  onChange={(raw) => updateTaxId(idx, 'tax_value', raw)}
                  pattern={taxTypes.find((t) => t.code === taxId.tax_type)?.placeholder}
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

      <ImportDialog
        open={importOpen}
        title="Import Employees"
        loading={importMut.isPending}
        onSubmit={handleImport}
        onCancel={() => setImportOpen(false)}
      />

      <ConfirmDialog {...archiveConfirmProps} />
      <ConfirmDialog {...restoreConfirmProps} />

      <ResetPasswordDialog
        open={resetPwOpen}
        onClose={() => { setResetPwOpen(false); setResetPwTarget(null); }}
        onSuccess={() => { setResetPwOpen(false); setResetPwTarget(null); toast('Password reset successfully'); }}
        employeeId={resetPwTarget?.id}
        employeeName={resetPwTarget ? `${resetPwTarget.first_name} ${resetPwTarget.last_name}` : ''}
      />

      <SetPasswordPopover anchorEl={pwAnchor} onConfirm={handlePwConfirm} onCancel={handlePwCancel} />

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
