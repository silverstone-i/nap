import { Box, Paper, Typography } from '@mui/material';

export default function RulesPoliciesPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Policy governance
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
        Centralise global and local compliance rules. This placeholder demonstrates how feature modules render within the shared layout.
      </Typography>
      <Paper elevation={0} variant="outlined" sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Policy summary placeholder content
        </Typography>
      </Paper>
    </Box>
  );
}
