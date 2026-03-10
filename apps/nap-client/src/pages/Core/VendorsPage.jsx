/**
 * @file Vendors CRUD page — DataGrid + create/edit/archive/restore with tax identifiers
 * @module nap-client/pages/Core/VendorsPage
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
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

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import FormDialog from '../../components/shared/FormDialog.jsx';
import { useModuleToolbarRegistration } from '../../contexts/ModuleActionsContext.jsx';
import {
  useVendors, useCreateVendor, useUpdateVendor, useArchiveVendor, useRestoreVendor,
} from '../../hooks/useVendors.js';
import {
  useTaxIdentifiers, useCreateTaxIdentifier, useUpdateTaxIdentifier, useArchiveTaxIdentifier,
} from '../../hooks/useTaxIdentifiers.js';
import { TAX_TYPES, COUNTRIES } from '@nap/shared';
import { pageContainerSx, formGridSx, formGroupCardSx } from '../../config/layoutTokens.js';
import { buildBulkActions } from '../../utils/selectionUtils.js';
import { useDataGridSelection } from '../../hooks/useDataGridSelection.js';
import { useArchiveRestore } from '../../hooks/useArchiveRestore.js';

const BLANK_CREATE = { name: '', code: '', payment_terms: '', notes: '' };
const BLANK_EDIT = { name: '', code: '', payment_terms: '', notes: '' };
const BLANK_TAX_ID = { country_code: 'US', tax_type: 'TIN', tax_value: '', is_primary: false };

const columns = [
  { field: 'code', headerName: 'Code', width: 120 },
  { field: 'name', headerName: 'Vendor Name', flex: 1, minWidth: 200 },
  { field: 'payment_terms', headerName: 'Terms', width: 130 },
  {
    field: 'is_active',
    headerName: 'Active',
    width: 100,
    renderCell: ({ value }) => <StatusBadge status={value ? 'active' : 'suspended'} />,
  },
];

export default function VendorsPage() {
  const { data: res, isLoading } = useVendors();
  const allRows = res?.rows ?? [];

  const [viewFilter, setViewFilter] = useState('active');
  const rows = useMemo(() => {
    if (viewFilter === 'active') return allRows.filter((r) => !r.deactivated_at);
    if (viewFilter === 'archived') return allRows.filter((r) => !!r.deactivated_at);
    return allRows;
  }, [allRows, viewFilter]);

  const createMut = useCreateVendor();
  const updateMut = useUpdateVendor();
  const archiveMut = useArchiveVendor();
  const restoreMut = useRestoreVendor();

  const createTaxIdMut = useCreateTaxIdentifier();
  const updateTaxIdMut = useUpdateTaxIdentifier();
  const archiveTaxIdMut = useArchiveTaxIdentifier();

  const { selectionModel, setSelectionModel, onSelectionChange, selectedRows, selected, isSingle, hasSelection, allActive, allArchived } =
    useDataGridSelection(rows);

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [editSourceId, setEditSourceId] = useState(null);
  const { data: taxIdsRes } = useTaxIdentifiers(
    { source_id: editSourceId, includeDeactivated: 'false' },
    { enabled: !!editSourceId },
  );

  const [createForm, setCreateForm] = useState(BLANK_CREATE);
  const [editForm, setEditForm] = useState(BLANK_EDIT);
  const [editTaxIds, setEditTaxIds] = useState([]);

  const [snack, setSnack] = useState({ open: false, msg: '', sev: 'success' });
  const toast = useCallback((msg, sev = 'success') => setSnack({ open: true, msg, sev }), []);
  const errMsg = (err) => err.payload?.error || err.payload?.message || err.message;

  const onCreateField = (f) => (e) => setCreateForm((p) => ({ ...p, [f]: e.target.value }));
  const onEditField = (f) => (e) => setEditForm((p) => ({ ...p, [f]: e.target.value }));

  /* ── Tax ID edit helpers ──────────────────────────────────── */
  const updateTaxId = (idx, field, value) =>
    setEditTaxIds((prev) => prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  const addTaxId = () => setEditTaxIds((prev) => [...prev, { ...BLANK_TAX_ID }]);
  const removeTaxId = (idx) =>
    setEditTaxIds((prev) => prev.map((t, i) => (i === idx ? { ...t, _deleted: true } : t)));

  /* ── Sync query-fetched tax identifiers into edit state ──── */
  useEffect(() => {
    if (editOpen && taxIdsRes?.rows) setEditTaxIds(taxIdsRes.rows);
  }, [editOpen, taxIdsRes]);

  const openEdit = useCallback(() => {
    if (!selected) return;
    setEditForm({
      name: selected.name ?? '',
      code: selected.code ?? '',
      payment_terms: selected.payment_terms ?? '',
      notes: selected.notes ?? '',
    });
    setEditSourceId(selected.source_id || null);
    if (!selected.source_id) setEditTaxIds([]);
    setEditOpen(true);
  }, [selected]);

  const handleCreate = async () => {
    try {
      await createMut.mutateAsync(createForm);
      toast('Vendor created');
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
        for (const t of editTaxIds) {
          if (t._deleted && t.id) {
            await archiveTaxIdMut.mutateAsync({ id: t.id });
          } else if (!t.id && !t._deleted) {
            await createTaxIdMut.mutateAsync({
              source_id: selected.source_id,
              country_code: t.country_code,
              tax_type: t.tax_type,
              tax_value: t.tax_value,
              is_primary: t.is_primary,
            });
          } else if (t.id && !t._deleted) {
            await updateTaxIdMut.mutateAsync({
              filter: { id: t.id },
              changes: {
                country_code: t.country_code,
                tax_type: t.tax_type,
                tax_value: t.tax_value,
                is_primary: t.is_primary,
              },
            });
          }
        }
      }

      toast('Vendor updated');
      setEditOpen(false);
      setEditSourceId(null);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const { setArchiveOpen, setRestoreOpen, archiveConfirmProps, restoreConfirmProps } = useArchiveRestore({
    selectedRows, archiveMut, restoreMut, entityName: 'vendor', setSelectionModel, toast, errMsg, getLabel: (r) => r.name,
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
        { label: 'Create Vendor', variant: 'contained', color: 'primary', onClick: () => { setCreateForm(BLANK_CREATE); setCreateOpen(true); } },
        { label: 'Edit', variant: 'outlined', disabled: !isSingle, onClick: openEdit },
        ...buildBulkActions({ selectedRows, hasSelection, allActive, allArchived, onArchive: () => setArchiveOpen(true), onRestore: () => setRestoreOpen(true) }),
      ],
    }),
    [isSingle, hasSelection, allActive, allArchived, selectedRows.length, viewFilter, openEdit, setSelectionModel, setArchiveOpen, setRestoreOpen],
  );
  useModuleToolbarRegistration(toolbar);

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

      <FormDialog open={createOpen} title="Create Vendor" submitLabel="Create" loading={createMut.isPending} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)}>
        <TextField label="Vendor Name" required value={createForm.name} onChange={onCreateField('name')} />
        <TextField label="Code" value={createForm.code} onChange={onCreateField('code')} inputProps={{ maxLength: 16 }} />
        <TextField label="Payment Terms" value={createForm.payment_terms} onChange={onCreateField('payment_terms')} />
        <TextField label="Notes" multiline minRows={2} value={createForm.notes} onChange={onCreateField('notes')} />
      </FormDialog>

      {/* ── Edit Vendor Dialog ──────────────────────────────────── */}
      <FormDialog open={editOpen} title="Edit Vendor" submitLabel="Save Changes" maxWidth="md" loading={updateMut.isPending} onSubmit={handleUpdate} onCancel={() => { setEditOpen(false); setEditSourceId(null); }}>
        <Box sx={formGridSx}>
          <TextField label="Vendor Name" required value={editForm.name} onChange={onEditField('name')} />
          <TextField label="Code" value={editForm.code} onChange={onEditField('code')} inputProps={{ maxLength: 16 }} />
          <TextField label="Payment Terms" value={editForm.payment_terms} onChange={onEditField('payment_terms')} />
          <TextField label="Notes" multiline minRows={2} value={editForm.notes} onChange={onEditField('notes')} />
        </Box>

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
                    // Reset tax_type when country changes
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

      <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snack.sev} variant="filled" onClose={() => setSnack((s) => ({ ...s, open: false }))}>{snack.msg}</Alert>
      </Snackbar>
    </Box>
  );
}
