/**
 * @file FieldGroupDefinitionEditor — CRUD for Layer 4 RBAC field group definitions
 * @module nap-client/pages/Tenant/FieldGroupDefinitionEditor
 *
 * Lists all field group definitions grouped by module/router. Admins can create,
 * edit, and delete definitions. Each definition maps a group_name to an array of
 * column names for a specific resource.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import FormDialog from '../../components/shared/FormDialog.jsx';
import ConfirmDialog from '../../components/shared/ConfirmDialog.jsx';
import {
  useFieldGroupDefinitions,
  useCreateFieldGroupDefinition,
  useUpdateFieldGroupDefinition,
  useDeleteFieldGroupDefinition,
} from '../../hooks/useFieldGroups.js';
import { usePolicyCatalog } from '../../hooks/usePolicies.js';

/* ── Helpers ──────────────────────────────────────────────────── */

function resourceLabel(module, router, catalogRows) {
  const entry = catalogRows.find((e) => e.module === module && e.router === router && e.action === null);
  return entry?.label ?? `${module} > ${router}`;
}

function groupByResource(definitions) {
  const map = new Map();
  for (const d of definitions) {
    const key = `${d.module}::${d.router || ''}`;
    if (!map.has(key)) map.set(key, { module: d.module, router: d.router, groups: [] });
    map.get(key).groups.push(d);
  }
  return [...map.values()];
}

function buildModuleRouterOptions(catalogRows) {
  const modules = new Map();
  for (const entry of catalogRows) {
    if (entry.action !== null) continue;
    if (!modules.has(entry.module)) modules.set(entry.module, []);
    if (entry.router) modules.get(entry.module).push(entry.router);
  }
  return modules;
}

const BLANK_FORM = { module: '', router: '', group_name: '', columnsText: '', is_default: false };

/* ── Component ────────────────────────────────────────────────── */

export default function FieldGroupDefinitionEditor() {
  const { data: defsRes, isLoading } = useFieldGroupDefinitions();
  const { data: catalogRes } = usePolicyCatalog();
  const createMut = useCreateFieldGroupDefinition();
  const updateMut = useUpdateFieldGroupDefinition();
  const deleteMut = useDeleteFieldGroupDefinition();

  const catalogRows = catalogRes?.rows ?? [];
  const definitions = defsRes?.rows ?? [];
  const resources = useMemo(() => groupByResource(definitions), [definitions]);
  const moduleRouterMap = useMemo(() => buildModuleRouterOptions(catalogRows), [catalogRows]);

  /* ── dialog state ──────────────────────────────────────────── */
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const isEditing = editingId !== null;
  const routerOptions = form.module ? moduleRouterMap.get(form.module) ?? [] : [];

  /* ── field change factory ──────────────────────────────────── */
  const onField = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  /* ── handlers ──────────────────────────────────────────────── */
  const openCreate = useCallback(() => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((def) => {
    setEditingId(def.id);
    setForm({
      module: def.module,
      router: def.router ?? '',
      group_name: def.group_name,
      columnsText: def.columns.join(', '),
      is_default: def.is_default,
    });
    setFormOpen(true);
  }, []);

  const handleSubmit = useCallback(async () => {
    const columns = form.columnsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const body = {
      module: form.module,
      router: form.router || null,
      group_name: form.group_name,
      columns,
      is_default: form.is_default,
    };

    if (isEditing) {
      await updateMut.mutateAsync({ id: editingId, changes: body });
    } else {
      await createMut.mutateAsync(body);
    }
    setFormOpen(false);
    setForm(BLANK_FORM);
    setEditingId(null);
  }, [form, isEditing, editingId, createMut, updateMut]);

  const openDelete = useCallback((id) => {
    setDeletingId(id);
    setConfirmOpen(true);
  }, []);

  const handleDelete = useCallback(async () => {
    await deleteMut.mutateAsync(deletingId);
    setConfirmOpen(false);
    setDeletingId(null);
  }, [deletingId, deleteMut]);

  /* ── render ────────────────────────────────────────────────── */
  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Action bar */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button size="small" variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Add Definition
        </Button>
      </Box>

      <Typography variant="caption" color="text.secondary">
        Define named column groups per resource. Groups marked as default are visible to all roles.
      </Typography>

      {definitions.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No field group definitions yet. Click &ldquo;Add Definition&rdquo; to create one.
        </Typography>
      )}

      {resources.map((resource) => (
        <Box key={`${resource.module}::${resource.router}`} sx={{ mb: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            {resourceLabel(resource.module, resource.router, catalogRows)}
          </Typography>
          {resource.groups.map((def) => (
            <Box
              key={def.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 0.25,
                px: 1,
                '&:hover': { bgcolor: 'action.hover' },
                borderRadius: 0.5,
              }}
            >
              <Typography variant="body2" sx={{ minWidth: 140 }}>
                {def.group_name}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flex: 1 }}>
                {def.columns.map((col) => (
                  <Chip key={col} label={col} size="small" variant="outlined" />
                ))}
              </Box>
              {def.is_default && <Chip label="Default" size="small" color="info" />}
              <IconButton size="small" onClick={() => openEdit(def)}>
                <EditOutlinedIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" color="error" onClick={() => openDelete(def.id)}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
        </Box>
      ))}

      {/* Create / Edit Dialog */}
      <FormDialog
        open={formOpen}
        title={isEditing ? 'Edit Field Group' : 'Create Field Group'}
        submitLabel={isEditing ? 'Save Changes' : 'Create'}
        loading={createMut.isPending || updateMut.isPending}
        submitDisabled={!form.module || !form.group_name || !form.columnsText.trim()}
        onSubmit={handleSubmit}
        onCancel={() => setFormOpen(false)}
      >
        <TextField
          label="Module"
          select
          required
          value={form.module}
          onChange={(e) => setForm((p) => ({ ...p, module: e.target.value, router: '' }))}
          disabled={isEditing}
        >
          {[...moduleRouterMap.keys()].map((m) => (
            <MenuItem key={m} value={m}>{m}</MenuItem>
          ))}
        </TextField>
        <TextField
          label="Router"
          select
          value={form.router}
          onChange={onField('router')}
          disabled={isEditing || routerOptions.length === 0}
        >
          <MenuItem value="">— None —</MenuItem>
          {routerOptions.map((r) => (
            <MenuItem key={r} value={r}>{r}</MenuItem>
          ))}
        </TextField>
        <TextField
          label="Group Name"
          required
          value={form.group_name}
          onChange={onField('group_name')}
          inputProps={{ maxLength: 64 }}
        />
        <TextField
          label="Columns (comma-separated)"
          required
          value={form.columnsText}
          onChange={onField('columnsText')}
          helperText="e.g. id, name, status, amount"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={form.is_default}
              onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))}
            />
          }
          label="Default (visible to all roles)"
        />
      </FormDialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete Field Group"
        message="This will remove the field group definition and any associated grants. This action cannot be undone."
        confirmLabel="Delete"
        confirmColor="error"
        loading={deleteMut.isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </Box>
  );
}
