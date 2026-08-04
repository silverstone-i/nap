/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import Avatar from '@mui/material/Avatar';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useThemeMode, type ThemeModePreference } from '../theme/useThemeMode';

const themeChoices: Array<[ThemeModePreference, string]> = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

export function UserMenu() {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const { preference, setPreference } = useThemeMode();

  return (
    <>
      <IconButton
        onClick={e => setAnchorEl(e.currentTarget)}
        aria-label="Account"
        size="small"
      >
        <Avatar
          sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: 13 }}
        >
          IS
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        <MenuItem onClick={() => setAnchorEl(null)}>Profile</MenuItem>
        <MenuItem onClick={() => setAnchorEl(null)}>Sign out</MenuItem>
        <Divider />
        <ListSubheader disableSticky sx={{ lineHeight: '32px' }}>
          Theme
        </ListSubheader>
        {themeChoices.map(([value, label]) => (
          <MenuItem
            key={value}
            selected={preference === value}
            onClick={() => setPreference(value)}
          >
            {label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
