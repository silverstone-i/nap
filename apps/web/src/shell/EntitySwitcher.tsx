/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { getEntities } from '../mocks/data';
import { useScope } from './useScope';

export function EntitySwitcher() {
  const { entityId, setEntity } = useScope();

  return (
    <TextField
      select
      size="small"
      value={entityId}
      onChange={e => setEntity(e.target.value)}
      slotProps={{ htmlInput: { 'aria-label': 'Entity' } }}
      sx={{ minWidth: 240 }}
    >
      {getEntities().map(entity => (
        <MenuItem key={entity.id} value={entity.id}>
          {entity.name}
        </MenuItem>
      ))}
    </TextField>
  );
}
