/**
 * @file StateFilterEditor — Layer 3 RBAC state filter configuration per role
 * @module nap-client/pages/Tenant/StateFilterEditor
 *
 * Allows admins to restrict which record statuses are visible to a role
 * for specific resources. Empty state = all statuses visible.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import CircularProgress from '@mui/material/CircularProgress';

import { useStateFiltersForRole, useSyncStateFilters } from '../../hooks/useStateFilters.js';
import { usePolicyCatalog } from '../../hooks/usePolicies.js';

/* ── Helpers ──────────────────────────────────────────────────── */

function resourceLabel(module, router, catalogRows) {
  const entry = catalogRows.find((e) => e.module === module && e.router === router && e.action === null);
  return entry?.label ?? `${module} > ${router}`;
}

/* ── Component ────────────────────────────────────────────────── */

export default function StateFilterEditor({ roleId, readOnly = false }) {
  const { data: filtersRes, isLoading: filtersLoading } = useStateFiltersForRole(roleId);
  const { data: catalogRes } = usePolicyCatalog();
  const syncMut = useSyncStateFilters();

  const catalogRows = catalogRes?.rows ?? [];
  const routerEntries = useMemo(
    () => catalogRows.filter((e) => e.router !== null && e.action === null),
    [catalogRows],
  );

  const [filters, setFilters] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newModule, setNewModule] = useState('');
  const [newRouter, setNewRouter] = useState('');
  const [newStatuses, setNewStatuses] = useState('');
  const [newStatusesArr, setNewStatusesArr] = useState([]);

  const serverFilters = useMemo(
    () => (filtersRes?.records ?? []).map((f) => ({
      module: f.module,
      router: f.router,
      visible_statuses: f.visible_statuses,
    })),
    [filtersRes],
  );

  useEffect(() => {
    setFilters(serverFilters);
    setDirty(false);
  }, [serverFilters]);

  const modules = useMemo(() => [...new Set(routerEntries.map((e) => e.module))], [routerEntries]);
  const routersForModule = useMemo(
    () => routerEntries.filter((e) => e.module === newModule),
    [routerEntries, newModule],
  );

  const selectedCatalogEntry = useMemo(
    () => (newModule && newRouter ? catalogRows.find((e) => e.module === newModule && e.router === newRouter && e.action === null) : null),
    [catalogRows, newModule, newRouter],
  );
  const validStatuses = selectedCatalogEntry?.valid_statuses;

  const handleRemove = useCallback((idx) => {
    setFilters((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }, []);

  const handleAdd = useCallback(() => {
    if (!newModule || !newRouter) return;
    const statuses = validStatuses
      ? newStatusesArr
      : newStatuses.split(',').map((s) => s.trim()).filter(Boolean);
    if (!statuses.length) return;
    setFilters((prev) => [...prev, { module: newModule, router: newRouter, visible_statuses: statuses }]);
    setDirty(true);
    setAdding(false);
    setNewModule('');
    setNewRouter('');
    setNewStatuses('');
    setNewStatusesArr([]);
  }, [newModule, newRouter, newStatuses, newStatusesArr, validStatuses]);

  const handleDiscard = useCallback(() => {
    setFilters(serverFilters);
    setDirty(false);
    setAdding(false);
  }, [serverFilters]);

  const handleSave = useCallback(async () => {
    await syncMut.mutateAsync({ roleId, stateFilters: filters });
    setDirty(false);
  }, [filters, roleId, syncMut]);

  if (filtersLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Action bar */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        {!readOnly && (
          <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
            Add Filter
          </Button>
        )}
        {dirty && !readOnly && (
          <Button size="small" variant="outlined" onClick={handleDiscard}>Discard</Button>
        )}
        <Button
          size="small"
          variant="contained"
          disabled={!dirty || readOnly || syncMut.isPending}
          onClick={handleSave}
        >
          {syncMut.isPending ? 'Saving\u2026' : 'Save Filters'}
        </Button>
      </Box>

      <Typography variant="caption" color="text.secondary">
        State filters restrict which record statuses this role can see. No filters = all statuses visible.
      </Typography>

      {/* Existing filters */}
      {filters.length === 0 && !adding && (
        <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
          No state filters configured. All statuses are visible.
        </Typography>
      )}

      {filters.map((f, idx) => (
        <Box
          key={`${f.module}-${f.router}-${idx}`}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            py: 0.75,
            px: 1,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
          }}
        >
          <Typography variant="body2" sx={{ minWidth: 180 }}>
            {resourceLabel(f.module, f.router, catalogRows)}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flex: 1 }}>
            {f.visible_statuses.map((status) => (
              <Chip key={status} label={status} size="small" variant="outlined" />
            ))}
          </Box>
          {!readOnly && (
            <IconButton size="small" color="error" onClick={() => handleRemove(idx)}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      ))}

      {/* Add filter form */}
      {adding && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', p: 1, border: 1, borderColor: 'primary.main', borderRadius: 1 }}>
          <TextField
            select
            label="Module"
            size="small"
            value={newModule}
            onChange={(e) => { setNewModule(e.target.value); setNewRouter(''); setNewStatusesArr([]); }}
            sx={{ minWidth: 140 }}
          >
            {modules.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
          </TextField>
          <TextField
            select
            label="Resource"
            size="small"
            value={newRouter}
            onChange={(e) => { setNewRouter(e.target.value); setNewStatusesArr([]); }}
            disabled={!newModule}
            sx={{ minWidth: 180 }}
          >
            {routersForModule.map((e) => <MenuItem key={e.router} value={e.router}>{e.label}</MenuItem>)}
          </TextField>
          {validStatuses ? (
            <FormGroup row sx={{ flex: 1, gap: 0 }}>
              {validStatuses.map((s) => (
                <FormControlLabel
                  key={s}
                  control={
                    <Checkbox
                      size="small"
                      checked={newStatusesArr.includes(s)}
                      onChange={(e) => {
                        setNewStatusesArr((prev) =>
                          e.target.checked ? [...prev, s] : prev.filter((v) => v !== s),
                        );
                      }}
                    />
                  }
                  label={s}
                  sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.8125rem' } }}
                />
              ))}
            </FormGroup>
          ) : (
            <TextField
              label="Statuses (comma-separated)"
              size="small"
              value={newStatuses}
              onChange={(e) => setNewStatuses(e.target.value)}
              sx={{ flex: 1 }}
            />
          )}
          <Button
            size="small"
            variant="contained"
            onClick={handleAdd}
            disabled={!newModule || !newRouter || (validStatuses ? !newStatusesArr.length : !newStatuses.trim())}
          >
            Add
          </Button>
          <Button size="small" onClick={() => setAdding(false)}>Cancel</Button>
        </Box>
      )}
    </Box>
  );
}
