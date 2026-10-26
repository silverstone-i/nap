/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { useNavigate } from 'react-router';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useTheme } from '@mui/material/styles';
import { useSession } from '../auth/SessionContext.jsx';
import { useEffectiveSettings } from './EffectiveSettingsContext.jsx';
import { initialsFromEmail } from './initials.js';
import { useProfileImage } from './useProfileImage.js';

/**
 * Avatar-triggered profile menu: Profile, Change password, and Log out
 * (I0001-R011, R044, M0006-03-R006). The display mode is on Profile. The
 * avatar shows the member's profile image, else their initials; an image
 * that fails to load falls back to initials (M0006-03-R007).
 * @returns {JSX.Element}
 */
export function ProfileMenu() {
  const theme = useTheme();
  const navigate = useNavigate();
  const session = useSession();
  const [anchor, setAnchor] = useState(null);
  const image = useProfileImage(useEffectiveSettings().settings.profileImage);

  const close = () => setAnchor(null);

  return (
    <>
      <IconButton
        onClick={event => setAnchor(event.currentTarget)}
        aria-label="Account menu"
        aria-haspopup="true"
        aria-expanded={Boolean(anchor)}
      >
        <Avatar
          src={image ?? undefined}
          alt=""
          sx={{
            width: 32,
            height: 32,
            fontSize: 13,
            bgcolor: theme.palette.primary.main,
          }}
        >
          {initialsFromEmail(session.user?.email ?? '')}
        </Avatar>
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        {/* Always offered: Profile holds the theme (I0001-R044), and the
            member's profile once a tenant is selected (M0006-03-R001). */}
        <MenuItem
          onClick={() => {
            close();
            navigate('/profile');
          }}
        >
          Profile
        </MenuItem>
        <MenuItem
          onClick={() => {
            close();
            navigate('/password');
          }}
        >
          Change password
        </MenuItem>
        <MenuItem
          onClick={() => {
            close();
            session.logout();
          }}
        >
          Log out
        </MenuItem>
      </Menu>
    </>
  );
}
