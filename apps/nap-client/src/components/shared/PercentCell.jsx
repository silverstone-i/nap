/**
 * @file DataGrid renderCell for percentage values
 * @module nap-client/components/shared/PercentCell
 *
 * Renders a numeric value as a percentage string (e.g. "42.5%").
 * Colour thresholds: >= 40% green, >= 20% yellow-orange, < 20% red.
 *
 * Usage in column definition:
 *   renderCell: (params) => <PercentCell value={params.value} />
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Typography from '@mui/material/Typography';

export default function PercentCell({ value }) {
  const n = Number(value) || 0;
  let color = 'error.main';
  if (n >= 40) color = 'success.main';
  else if (n >= 20) color = 'warning.main';
  return (
    <Typography variant="body2" color={color} noWrap>
      {n.toFixed(2)}%
    </Typography>
  );
}
