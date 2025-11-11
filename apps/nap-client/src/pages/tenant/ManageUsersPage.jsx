import { Box, Paper, Stack, Typography } from '@mui/material';

export default function ManageUsersPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Manage users
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Grant roles, reset access, and review membership per tenant.
      </Typography>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Stack spacing={1}>
          <Typography variant="subtitle2">User management placeholder</Typography>
          <Typography variant="body2" color="text.secondary">
            Build your user directory and actions here.
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
