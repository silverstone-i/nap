import React from 'react';
import { Typography, Box } from '@mui/material';

// Skeleton budgets page.  This can later be expanded with tabs
// showing budget versions and cost lines per unit.  For now it
// simply displays a placeholder heading.
export default function BudgetsPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Budgets & Cost Tracking
      </Typography>
      <Typography>
        Budget management features will appear here.  Select a project
        to view and edit budget versions.
      </Typography>
    </Box>
  );
}