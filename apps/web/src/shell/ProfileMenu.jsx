/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { useNavigate } from 'react-router';
import CheckIcon from '@mui/icons-material/Check';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useTheme } from '@mui/material/styles';
import { useSession } from '../auth/SessionContext.jsx';
import { useThemeMode } from '../theme/ThemeModeContext.jsx';
import { initialsFromEmail } from './initials.js';

const MODE_LABELS = { dark: 'Dark', light: 'Light', system: 'System' };

/**
 * Avatar-triggered profile menu: Change password, Logout, and a Settings
 * submenu for the display mode (F0001-R011).
 * @returns {JSX.Element}
 */
export function ProfileMenu() {
  const theme = useTheme();
  const navigate = useNavigate();
  const session = useSession();
  const { mode, setMode } = useThemeMode();
  const [anchor, setAnchor] = useState(null);
  const [settingsAnchor, setSettingsAnchor] = useState(null);

  const close = () => {
    setAnchor(null);
    setSettingsAnchor(null);
  };

  return (
    <>
      <IconButton
        onClick={event => setAnchor(event.currentTarget)}
        aria-label="Account menu"
        aria-haspopup="true"
        aria-expanded={Boolean(anchor)}
      >
        <Avatar
          sx={{
            width: 32,
            height: 32,
            fontSize: 13,
            bgcolor: theme.palette.primary.main,
          }}
        >
          {initialsFromEmail(
            session.user?.email ?? session.session?.user ?? ''
          )}
        </Avatar>
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        <MenuItem
          onClick={() => {
            close();
            navigate('/password');
          }}
        >
          Change password
        </MenuItem>
        <MenuItem
          onClick={event => setSettingsAnchor(event.currentTarget)}
          aria-haspopup="true"
          aria-expanded={Boolean(settingsAnchor)}
        >
          <ListItemText>Settings</ListItemText>
          <ChevronRightIcon fontSize="small" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            close();
            session.logout();
          }}
        >
          Logout
        </MenuItem>
      </Menu>
      <Menu
        anchorEl={settingsAnchor}
        open={Boolean(settingsAnchor)}
        onClose={close}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        {['dark', 'light', 'system'].map(value => (
          <MenuItem
            key={value}
            selected={mode === value}
            onClick={() => {
              setMode(value);
              close();
            }}
          >
            <ListItemIcon>
              {mode === value ? <CheckIcon fontSize="small" /> : null}
            </ListItemIcon>
            <ListItemText>{MODE_LABELS[value]}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
