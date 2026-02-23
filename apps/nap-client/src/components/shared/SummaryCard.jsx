/**
 * @file KPI summary card component for dashboard
 * @module nap-client/components/shared/SummaryCard
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';

export default function SummaryCard({ title, value, color }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {title}
        </Typography>
        <Typography variant="h5" color={color || 'text.primary'}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}
