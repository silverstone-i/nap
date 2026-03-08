/**
 * @file Currency display component for DataGrid cells
 * @module nap-client/components/shared/CurrencyCell
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import Typography from '@mui/material/Typography';

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function CurrencyCell({ value, variance }) {
  if (value == null || value === '') return '\u2014';
  const num = Number(value);
  const color = variance ? (num < 0 ? 'error.main' : num > 0 ? 'success.main' : 'text.primary') : 'text.primary';
  return (
    <Typography variant="body2" component="span" color={color}>
      {fmt.format(num)}
    </Typography>
  );
}
