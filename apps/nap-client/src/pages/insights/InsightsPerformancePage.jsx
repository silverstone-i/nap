import { Box, Grid, Paper, Typography } from '@mui/material';

export default function InsightsPerformancePage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Performance insights
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Compare projected and actual outcomes. Charts live inside feature modules while layout chrome remains shared.
      </Typography>
      <Grid container spacing={2}>
        {[1, 2].map((id) => (
          <Grid item xs={12} md={6} key={id}>
            <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2">Chart {id}</Typography>
              <Typography variant="body2" color="text.secondary">
                Insight placeholder
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
