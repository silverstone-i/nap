import { Box, Paper, Stack, Typography } from '@mui/material';

export default function ManageTenantsPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Manage tenants
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Create, update, and archive tenant workspaces from a single dashboard.
      </Typography>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={1}>
          <Typography variant="subtitle2">Tenant console placeholder</Typography>
          <Typography variant="body2" color="text.secondary">
            Replace this area with your actual table/forms to administer tenants.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
