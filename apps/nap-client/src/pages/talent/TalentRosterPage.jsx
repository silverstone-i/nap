import { Box, Paper, Typography } from '@mui/material';

export default function TalentRosterPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Talent roster
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Manage people data and assignments in a dedicated module while the layout keeps chrome consistent.
      </Typography>
      <Paper elevation={0} variant="outlined" sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Roster table placeholder
        </Typography>
      </Paper>
    </Box>
  );
}
