/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { orderActions } from './orderActions.js';

/**
 * A screen's actions as a row of buttons (I0001-R028). On a phone only the
 * last one (the create action, or else the most important) stays a button;
 * the rest fold into a ⋮ menu before it.
 * @param {{actions: Array<import('./orderActions.js').ScreenAction|null|false|undefined>, menuLabel?: string}} props
 * @returns {JSX.Element|null}
 */
export function ActionBar({ actions, menuLabel = 'More actions' }) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  const [anchor, setAnchor] = useState(null);
  const ordered = orderActions(actions);
  if (ordered.length === 0) return null;

  const folded = isPhone ? ordered.slice(0, -1) : [];
  const shown = isPhone ? ordered.slice(-1) : ordered;

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      {folded.length > 0 ? (
        <>
          <IconButton
            aria-label={menuLabel}
            onClick={event => setAnchor(event.currentTarget)}
          >
            <MoreVertIcon />
          </IconButton>
          <Menu
            anchorEl={anchor}
            open={Boolean(anchor)}
            onClose={() => setAnchor(null)}
          >
            {folded.map(action => (
              <MenuItem
                key={action.label}
                onClick={() => {
                  setAnchor(null);
                  action.onClick();
                }}
              >
                {action.label}
              </MenuItem>
            ))}
          </Menu>
        </>
      ) : null}
      {shown.map(action => (
        <Button
          key={action.label}
          variant={action.create ? 'contained' : 'outlined'}
          color={action.color ?? 'primary'}
          size="small"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
    </Stack>
  );
}
