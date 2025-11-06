import React from 'react';
import { Box, Paper, Typography } from '@mui/material';

export default function ManageUsersPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Manage Users
      </Typography>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography color="text.secondary">
          User provisioning tools, access controls, and invitation flows for NapSoft tenants will
          be implemented here. Select an action above to begin managing tenant users.
        </Typography>
      </Paper>
    </Box>
  );
}
