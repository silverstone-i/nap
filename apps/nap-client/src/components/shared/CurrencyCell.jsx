/**
 * @file DataGrid renderCell for currency values
 * @module nap-client/components/shared/CurrencyCell
 *
 * Formats a numeric value as USD currency. When `variance` prop is true,
 * positive values render green and negative values render red.
 *
 * Usage in column definition:
 *   renderCell: (params) => <CurrencyCell value={params.value} />
 *   renderCell: (params) => <CurrencyCell value={params.value} variance />
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Typography from '@mui/material/Typography';

const fmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function CurrencyCell({ value, variance = false }) {
  const n = Number(value) || 0;
  let color = 'text.primary';
  if (variance) {
    if (n > 0) color = 'success.main';
    else if (n < 0) color = 'error.main';
  }
  return (
    <Typography variant="body2" color={color} noWrap>
      {fmt.format(n)}
    </Typography>
  );
}
