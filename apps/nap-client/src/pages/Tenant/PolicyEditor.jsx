/**
 * @file PolicyEditor — accordion-based policy matrix for Layer 1 RBAC configuration
 * @module nap-client/pages/Tenant/PolicyEditor
 *
 * Reads the policy_catalog for structure, loads current policies for the selected
 * role, and renders a grouped accordion matrix with level selectors per entry.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CircularProgress from '@mui/material/CircularProgress';

import { createPortal } from 'react-dom';

import { usePolicyCatalog, usePoliciesForRole, useSyncPolicies } from '../../hooks/usePolicies.js';

/* ── Helpers ──────────────────────────────────────────────────── */

const ROOT_KEY = '::::'; // policyKey('', null, null) → '' + '::' + '' + '::' + ''

function policyKey(module, router, action) {
  return `${module}::${router || ''}::${action || ''}`;
}

/** Cascade: router → module → root → '' */
function resolveLevel(edits, routerKey, moduleKey) {
  return edits[routerKey] ?? edits[moduleKey] ?? edits[ROOT_KEY] ?? '';
}

/**
 * Build a tree from flat catalog rows: Map<module, { label, routers: Map<router, { label }> }>
 * Module-level entries (router=null, action=null) become the module node.
 * Router-level entries (action=null) become router children.
 */
function buildCatalogTree(catalogRows) {
  const sorted = [...catalogRows]
    .filter((e) => e.policy_required !== false)
    .sort((a, b) => a.sort_order - b.sort_order);
  const modules = new Map();

  for (const entry of sorted) {
    if (!modules.has(entry.module)) {
      modules.set(entry.module, { label: entry.module, routers: new Map() });
    }
    const mod = modules.get(entry.module);

    if (entry.router === null && entry.action === null) {
      mod.label = entry.label;
      continue;
    }

    if (entry.action === null) {
      mod.routers.set(entry.router, { label: entry.label, description: entry.description });
    }
  }

  return modules;
}

/* ── Level selector ───────────────────────────────────────────── */

const LEVELS = [
  { value: '', label: '\u2014' },
  { value: 'none', label: 'N' },
  { value: 'view', label: 'V' },
  { value: 'full', label: 'F' },
];

function LevelSelector({ value, onChange, disabled }) {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={value || ''}
      onChange={(_, val) => { if (val !== null) onChange(val); }}
      disabled={disabled}
    >
      {LEVELS.map((l) => (
        <ToggleButton key={l.value} value={l.value} sx={{ minWidth: 32, px: 1 }}>
          {l.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

/* ── Component ────────────────────────────────────────────────── */

export default function PolicyEditor({ roleId, readOnly = false, actionsContainer }) {
  const { data: catalogRes, isLoading: catalogLoading } = usePolicyCatalog();
  const { data: policiesRes, isLoading: policiesLoading } = usePoliciesForRole(roleId);
  const syncMut = useSyncPolicies();

  const catalogTree = useMemo(
    () => buildCatalogTree(catalogRes?.rows ?? []),
    [catalogRes],
  );

  const serverPolicies = useMemo(() => {
    const map = {};
    for (const p of policiesRes?.records ?? []) {
      map[policyKey(p.module, p.router, p.action)] = p.level;
    }
    return map;
  }, [policiesRes]);

  const [edits, setEdits] = useState({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setEdits(serverPolicies);
    setDirty(false);
  }, [serverPolicies]);

  const handleChange = useCallback((key, level) => {
    setEdits((prev) => {
      const next = { ...prev };
      if (level === '') {
        delete next[key];
      } else {
        next[key] = level;
      }
      return next;
    });
    setDirty(true);
  }, []);

  const handleDiscard = useCallback(() => {
    setEdits(serverPolicies);
    setDirty(false);
  }, [serverPolicies]);

  const handleSave = useCallback(async () => {
    const policies = Object.entries(edits).map(([key, level]) => {
      const [module, router, action] = key.split('::');
      return { module, router: router || null, action: action || null, level };
    });
    try {
      await syncMut.mutateAsync({ roleId, policies });
      setDirty(false);
    } catch (err) {
      console.error('[PolicyEditor] save failed', err);
    }
  }, [edits, roleId, syncMut]);

  if (catalogLoading || policiesLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Action buttons — portalled to tab row */}
      {actionsContainer && createPortal(
        <>
          {dirty && !readOnly && (
            <Button size="small" variant="outlined" onClick={handleDiscard}>Discard</Button>
          )}
          <Button
            size="small"
            variant="contained"
            disabled={!dirty || readOnly || syncMut.isPending}
            onClick={handleSave}
          >
            {syncMut.isPending ? 'Saving\u2026' : 'Save Policies'}
          </Button>
        </>,
        actionsContainer,
      )}

      {/* Legend */}
      <Typography variant="caption" color="text.secondary">
        {'\u2014'} = Inherit &nbsp; N = None &nbsp; V = View &nbsp; F = Full
      </Typography>

      {/* Accordion per module */}
      {[...catalogTree.entries()].map(([moduleName, mod]) => {
        const moduleKey = policyKey(moduleName, null, null);
        return (
          <Accordion key={moduleName} defaultExpanded={false} disableGutters variant="outlined">
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 1 }}>
                <Typography variant="subtitle2">{mod.label}</Typography>
                <Box onClick={(e) => e.stopPropagation()}>
                  <LevelSelector
                    value={resolveLevel(edits, moduleKey, moduleKey)}
                    onChange={(val) => handleChange(moduleKey, val)}
                    disabled={readOnly}
                  />
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              {[...mod.routers.entries()].map(([routerName, rtr]) => {
                const routerKey = policyKey(moduleName, routerName, null);
                return (
                  <Box
                    key={routerName}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      py: 0.5,
                      px: 1,
                      '&:hover': { bgcolor: 'action.hover' },
                      borderRadius: 0.5,
                    }}
                  >
                    <Typography variant="body2">{rtr.label}</Typography>
                    <LevelSelector
                      value={resolveLevel(edits, routerKey, moduleKey)}
                      onChange={(val) => handleChange(routerKey, val)}
                      disabled={readOnly}
                    />
                  </Box>
                );
              })}
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
