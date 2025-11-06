import React from 'react';
import { Box, Paper, Typography } from '@mui/material';

export default function ManageTenantsPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Manage Tenants
      </Typography>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography color="text.secondary">
          Tenant management dashboards, listing tables, and detail views will be surfaced here.
          Use the module actions above to perform administrative workflows.
        </Typography>
      </Paper>
    </Box>
  );
}
