/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';

/**
 * An Immutable chip for an immutable role, and an Archived chip (M0003-R016,
 * R025). A custom role shows no chip. The role grid's views already say
 * which roles are archived (I0011-R004), so it passes `showArchived={false}`.
 * @param {{role: {isImmutable: boolean, archived: boolean}, showArchived?: boolean}} props
 * @returns {JSX.Element|null}
 */
export function RoleBadges({ role, showArchived = true }) {
  const archived = showArchived && role.archived;
  if (!role.isImmutable && !archived) return null;
  return (
    <Stack
      direction="row"
      spacing={1}
      component="span"
      sx={{ display: 'inline-flex', verticalAlign: 'middle' }}
    >
      {role.isImmutable ? (
        <Chip
          size="small"
          label="Immutable"
          color="primary"
          variant="outlined"
        />
      ) : null}
      {archived ? <Chip size="small" label="Archived" /> : null}
    </Stack>
  );
}
