/**
 * @file Reusable label:value display row for read-only detail views
 * @module nap-client/components/shared/FieldRow
 *
 * Renders a label (text.secondary with CSS colon) alongside a value.
 * Pass `children` to override the default value rendering (e.g. StatusBadge, monospace).
 * Forwards `sx` to root Box for grid placement (gridColumn, etc.).
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

const labelSx = {
  flexShrink: 0,
  '&::after': { content: '":"' },
};

export default function FieldRow({ label, value, children, sx }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, alignItems: 'baseline', ...sx }}>
      <Typography variant="body2" color="text.secondary" sx={labelSx}>
        {label}
      </Typography>
      {children ?? <Typography variant="body2">{value ?? '\u2014'}</Typography>}
    </Box>
  );
}
