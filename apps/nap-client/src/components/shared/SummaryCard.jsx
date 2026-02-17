/**
 * @file KPI summary card for dashboards and report pages
 * @module nap-client/components/shared/SummaryCard
 *
 * Displays a single metric inside a compact MUI Card.
 * Optional subtitle and colour accent on the value.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';

export default function SummaryCard({ title, value, subtitle, color }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Typography variant="caption" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h5" fontWeight={600} color={color || 'text.primary'}>
          {value}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}
