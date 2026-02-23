/**
 * @file Currency display component for DataGrid cells
 * @module nap-client/components/shared/CurrencyCell
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Typography from '@mui/material/Typography';

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function CurrencyCell({ value }) {
  if (value == null || value === '') return '\u2014';
  return <Typography variant="body2" component="span">{fmt.format(Number(value))}</Typography>;
}
