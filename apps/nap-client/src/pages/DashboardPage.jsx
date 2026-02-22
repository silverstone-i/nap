/**
 * @file Dashboard page — placeholder for Phase 2
 * @module nap-client/pages/DashboardPage
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Box, Typography, Card, CardContent, Button } from '@mui/material';
import { useAuth } from '../contexts/AuthContext.jsx';

export default function DashboardPage() {
  const { user, tenant, logout } = useAuth();

  return (
    <Box sx={{ p: 3, maxWidth: 600, mx: 'auto', mt: 4 }}>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            User
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Email: {user?.email}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Status: {user?.status}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Entity: {user?.entity_type || 'none'} / {user?.entity_id || 'unlinked'}
          </Typography>
        </CardContent>
      </Card>

      {tenant && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Tenant
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {tenant.company} ({tenant.tenant_code})
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Schema: {tenant.schema_name} | Tier: {tenant.tier} | Status: {tenant.status}
            </Typography>
          </CardContent>
        </Card>
      )}

      <Button variant="outlined" color="error" onClick={logout}>
        Sign Out
      </Button>
    </Box>
  );
}
