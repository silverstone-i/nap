import { Box, Paper, Typography } from '@mui/material';

export default function InsightsTrendsPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Trend explorer
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Configure time horizons and compare tenants. Module-specific controls surface above via the toolbar context.
      </Typography>
      <Paper elevation={0} variant="outlined" sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Trend explorer placeholder
        </Typography>
      </Paper>
    </Box>
  );
}
