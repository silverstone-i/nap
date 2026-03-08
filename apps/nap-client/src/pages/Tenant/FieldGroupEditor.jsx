/**
 * @file FieldGroupEditor — Layer 4 RBAC field group grant configuration per role
 * @module nap-client/pages/Tenant/FieldGroupEditor
 *
 * Displays all field group definitions grouped by module/router. Admins toggle
 * which groups are granted to the selected role. Default groups are always granted.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';

import { useFieldGroupDefinitions, useFieldGroupGrantsForRole, useSyncFieldGroupGrants } from '../../hooks/useFieldGroups.js';
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

/* ── Component ────────────────────────────────────────────────── */

export default function FieldGroupEditor({ roleId, readOnly = false }) {
  const { data: defsRes, isLoading: defsLoading } = useFieldGroupDefinitions();
  const { data: grantsRes, isLoading: grantsLoading } = useFieldGroupGrantsForRole(roleId);
  const { data: catalogRes } = usePolicyCatalog();
  const syncMut = useSyncFieldGroupGrants();

  const catalogRows = catalogRes?.rows ?? [];
  const definitions = defsRes?.rows ?? [];
  const resources = useMemo(() => groupByResource(definitions), [definitions]);

  const serverGrantIds = useMemo(
    () => new Set((grantsRes?.records ?? []).map((g) => g.field_group_id)),
    [grantsRes],
  );

  const [grantIds, setGrantIds] = useState(new Set());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setGrantIds(serverGrantIds);
    setDirty(false);
  }, [serverGrantIds]);

  const handleToggle = useCallback((defId) => {
    setGrantIds((prev) => {
      const next = new Set(prev);
      if (next.has(defId)) next.delete(defId);
      else next.add(defId);
      return next;
    });
    setDirty(true);
  }, []);

  const handleDiscard = useCallback(() => {
    setGrantIds(serverGrantIds);
    setDirty(false);
  }, [serverGrantIds]);

  const handleSave = useCallback(async () => {
    await syncMut.mutateAsync({ roleId, grantIds: [...grantIds] });
    setDirty(false);
  }, [grantIds, roleId, syncMut]);

  if (defsLoading || grantsLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>;
  }

  if (definitions.length === 0) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No field groups have been defined. Field groups control which columns are visible per resource and are configured by administrators.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Action bar */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        {dirty && !readOnly && (
          <Button size="small" variant="outlined" onClick={handleDiscard}>Discard</Button>
        )}
        <Button
          size="small"
          variant="contained"
          disabled={!dirty || readOnly || syncMut.isPending}
          onClick={handleSave}
        >
          {syncMut.isPending ? 'Saving\u2026' : 'Save Grants'}
        </Button>
      </Box>

      <Typography variant="caption" color="text.secondary">
        Default groups are always visible. Toggle non-default groups to grant column visibility.
      </Typography>

      {resources.map((resource) => (
        <Box key={`${resource.module}::${resource.router}`} sx={{ mb: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
            {resourceLabel(resource.module, resource.router, catalogRows)}
          </Typography>
          {resource.groups.map((def) => {
            const isDefault = def.is_default;
            const isGranted = isDefault || grantIds.has(def.id);
            return (
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
                <Checkbox
                  size="small"
                  checked={isGranted}
                  disabled={isDefault || readOnly}
                  onChange={() => handleToggle(def.id)}
                />
                <Typography variant="body2" sx={{ minWidth: 140 }}>
                  {def.group_name}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', flex: 1 }}>
                  {def.columns.map((col) => (
                    <Chip key={col} label={col} size="small" variant="outlined" />
                  ))}
                </Box>
                {isDefault && <Chip label="Default" size="small" color="info" />}
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
