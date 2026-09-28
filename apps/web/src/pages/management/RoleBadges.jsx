/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';

/**
 * Immutable / Custom badge plus an Archived indicator (M0003-R016).
 * @param {{role: {isImmutable: boolean, archived: boolean}}} props
 * @returns {JSX.Element}
 */
export function RoleBadges({ role }) {
  return (
    <Stack direction="row" spacing={1}>
      <Chip
        size="small"
        label={role.isImmutable ? 'Immutable' : 'Custom'}
        color={role.isImmutable ? 'primary' : 'default'}
        variant="outlined"
      />
      {role.archived ? <Chip size="small" label="Archived" /> : null}
    </Stack>
  );
}
