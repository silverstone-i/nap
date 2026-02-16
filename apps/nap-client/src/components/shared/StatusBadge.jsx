/**
 * @file Reusable colour-coded status chip
 * @module nap-client/components/shared/StatusBadge
 *
 * Maps a status string to an MUI Chip with the appropriate colour.
 * Font weight / size handled by MuiChip sizeSmall theme override.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Chip from '@mui/material/Chip';

const COLOR_MAP = {
  /* tenant status */
  active: 'success',
  trial: 'info',
  suspended: 'error',
  pending: 'warning',
  /* user status */
  invited: 'info',
  locked: 'error',
  /* user role */
  member: 'default',
  admin: 'primary',
  super_user: 'secondary',
  /* tenant_role */
  billing: 'warning',
};

const label = (s) =>
  s
    ? s
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    : '';

export default function StatusBadge({ status, size = 'small' }) {
  return (
    <Chip
      label={label(status)}
      color={COLOR_MAP[status] || 'default'}
      variant="outlined"
      size={size}
    />
  );
}
