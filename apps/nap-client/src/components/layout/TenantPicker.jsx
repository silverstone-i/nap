/**
 * @file TenantPicker — tenant context switcher for NapSoft users
 * @module nap-client/components/layout/TenantPicker
 *
 * Fetches available tenants from the admin/schemas endpoint and renders
 * a compact Select dropdown. Only rendered for NapSoft users.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useEffect } from 'react';
import { Select, MenuItem, Chip } from '@mui/material';
import client from '../../services/client.js';
import { useAuth } from '../../contexts/AuthContext.jsx';

export default function TenantPicker() {
  const { tenant, user, assumeTenant, exitAssumption, assumedTenant } = useAuth();
  const [tenants, setTenants] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await client.get('/tenants/v1/admin/schemas');
        if (!cancelled) setTenants(list);
      } catch {
        // ignore — user may not have permission
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const currentCode = assumedTenant?.tenant_code?.toLowerCase() || user?.tenant_code?.toLowerCase() || '';

  const handleChange = (e) => {
    const code = e.target.value;
    if (code === '__exit__') {
      exitAssumption();
      return;
    }
    const selected = tenants.find((t) => t.tenant_code?.toLowerCase() === code);
    if (selected) {
      assumeTenant(selected);
    }
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
