import { Box, Grid, Paper, Typography } from '@mui/material';

export default function DashboardSnapshotsPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Operating snapshot
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        High level KPIs surface here. Use the sidebar to access deep-dive modules without recreating chrome per feature.
      </Typography>
      <Grid container spacing={2}>
        {[1, 2, 3].map((card) => (
          <Grid item xs={12} md={4} key={card}>
            <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2">Card {card}</Typography>
              <Typography variant="body2" color="text.secondary">
                Placeholder metric content
              </Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>
    </Box>
  );
}
