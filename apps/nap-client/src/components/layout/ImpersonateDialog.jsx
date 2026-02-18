/**
 * @file ImpersonateDialog — two-step tenant/user impersonation picker
 * @module nap-client/components/layout/ImpersonateDialog
 *
 * Step 1: Select a tenant from the tenant list.
 * Step 2: Select a user within that tenant.
 * Optionally enter a reason, then start impersonation.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Autocomplete,
  TextField,
  Box,
  Typography,
} from '@mui/material';
import client from '../../services/client.js';
import { useAuth } from '../../contexts/AuthContext.jsx';

export default function ImpersonateDialog({ open, onClose }) {
  const { startImpersonation } = useAuth();

  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch tenants when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await client.get('/tenants/v1/admin/schemas');
        if (!cancelled) setTenants(list);
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Fetch users when tenant is selected
  useEffect(() => {
    if (!selectedTenant) {
      setUsers([]);
      setSelectedUser(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await client.get(`/tenants/v1/nap-users?tenant_code=${selectedTenant.tenant_code}`);
        const rows = Array.isArray(list) ? list : list?.rows || [];
        if (!cancelled) setUsers(rows);
      } catch {
        if (!cancelled) setUsers([]);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedTenant]);

  const handleStart = async () => {
    if (!selectedUser) return;
    setLoading(true);
    setError(null);
    try {
      await startImpersonation(selectedUser.id, reason || undefined);
      handleClose();
    } catch (err) {
      setError(err.message || 'Failed to start impersonation');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedTenant(null);
    setSelectedUser(null);
    setReason('');
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Impersonate User</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Autocomplete
            options={tenants}
            getOptionLabel={(t) => `${t.company || t.tenant_code} (${t.tenant_code?.toUpperCase()})`}
            value={selectedTenant}
            onChange={(_, val) => {
              setSelectedTenant(val);
              setSelectedUser(null);
            }}
            renderInput={(params) => <TextField {...params} label="Select Tenant" size="small" />}
          />

          <Autocomplete
            options={users}
            getOptionLabel={(u) => `${u.user_name || u.email} (${u.email})`}
            value={selectedUser}
            onChange={(_, val) => setSelectedUser(val)}
            disabled={!selectedTenant}
            renderInput={(params) => <TextField {...params} label="Select User" size="small" />}
          />

          <TextField
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            size="small"
            multiline
            rows={2}
          />

          {error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          onClick={handleStart}
          variant="contained"
          color="warning"
          disabled={!selectedUser || loading}
        >
          {loading ? 'Starting...' : 'Start Impersonation'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
