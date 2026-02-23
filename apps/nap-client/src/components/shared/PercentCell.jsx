/**
 * @file Percentage display component for DataGrid cells
 * @module nap-client/components/shared/PercentCell
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Typography from '@mui/material/Typography';

export default function PercentCell({ value }) {
  if (value == null || value === '') return '\u2014';
  const num = Number(value);
  const color = num < 0 ? 'error.main' : num >= 20 ? 'success.main' : 'warning.main';
  return (
    <Typography variant="body2" component="span" color={color}>
      {num.toFixed(1)}%
    </Typography>
  );
}
