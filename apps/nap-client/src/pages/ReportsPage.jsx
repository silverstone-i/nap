import React from 'react';
import { Typography, Box } from '@mui/material';

export default function ReportsPage() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Reports
      </Typography>
      <Typography>
        Reporting dashboards and export tools will appear here.  Use
        filters to generate budget vs actual, profitability and
        consolidated financial reports.
      </Typography>
    </Box>
  );
}