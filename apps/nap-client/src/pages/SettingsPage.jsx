import React from 'react';
import { Typography, Box } from '@mui/material';

export default function SettingsPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Settings & Tenant Management
      </Typography>
      <Typography>
        User management, roles, tenant settings and general
        configuration pages will be implemented here.  Admins can
        invite users, assign roles and manage fiscal periods.
      </Typography>
    </Box>
  );
}