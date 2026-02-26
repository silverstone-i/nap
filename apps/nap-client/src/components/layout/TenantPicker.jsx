/**
 * @file TenantPicker — tenant context switcher for NapSoft users
 * @module nap-client/components/layout/TenantPicker
 *
 * Fetches available tenants from the admin/schemas endpoint and renders
 * a compact Select dropdown. Only rendered for NapSoft users.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Select, MenuItem, Chip } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useTenantSchemas, TENANT_SCHEMAS_KEY } from '../../hooks/useTenants.js';

export default function TenantPicker() {
  const { tenant, user, assumeTenant, exitAssumption, assumedTenant } = useAuth();
  const { data: tenants = [] } = useTenantSchemas();
  const qc = useQueryClient();

  const currentCode =
    assumedTenant?.tenant_code?.toLowerCase() || user?.tenant_code?.toLowerCase() || '';

  const handleChange = async (e) => {
    const code = e.target.value;
    if (code === '__exit__') {
      await exitAssumption();
    } else {
      const selected = tenants.find((t) => t.tenant_code?.toLowerCase() === code);
      if (!selected) return;
      await assumeTenant(selected);
    }
    // Tenant context changed — invalidate all entity queries so active observers refetch
    qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== TENANT_SCHEMAS_KEY[0] });
  };

  if (!tenants.length) {
    return (
      <Chip
        label={tenant?.tenant_code?.toUpperCase() || 'NO TENANT'}
        size="small"
        color="primary"
        variant="outlined"
      />
    );
  }

  return (
    <Select
      value={currentCode}
      onChange={handleChange}
      size="small"
      variant="outlined"
      sx={{ minWidth: 160, height: 32, fontSize: '0.8125rem' }}
    >
      {tenants.map((t) => (
        <MenuItem key={t.id} value={t.tenant_code?.toLowerCase()}>
          {t.company || t.tenant_code?.toUpperCase()}
        </MenuItem>
      ))}
      {assumedTenant && (
        <MenuItem value="__exit__" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
          Exit Assumed Tenant
        </MenuItem>
      )}
    </Select>
  );
}
