import { Box, Paper, Typography } from '@mui/material';

export default function DashboardTeamsPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Team signals
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Summaries of team utilisation, staffing, and sentiment across tenants.
      </Typography>
      <Paper elevation={0} variant="outlined" sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Team list placeholder
        </Typography>
      </Paper>
    </Box>
  );
}
