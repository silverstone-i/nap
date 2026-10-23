/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';

/**
 * Immutable / Custom badge plus an Archived indicator (M0003-R016). The
 * role grid shows Archived next to the name instead (I0001-R030), so it
 * passes `showArchived={false}`.
 * @param {{role: {isImmutable: boolean, archived: boolean}, showArchived?: boolean}} props
 * @returns {JSX.Element}
 */
export function RoleBadges({ role, showArchived = true }) {
  return (
    <Stack direction="row" spacing={1}>
      <Chip
        size="small"
        label={role.isImmutable ? 'Immutable' : 'Custom'}
        color={role.isImmutable ? 'primary' : 'default'}
        variant="outlined"
      />
      {showArchived && role.archived ? (
        <Chip size="small" label="Archived" />
      ) : null}
    </Stack>
  );
}
