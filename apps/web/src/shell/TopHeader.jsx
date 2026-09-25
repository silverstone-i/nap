/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useNavigate } from 'react-router';
import MenuIcon from '@mui/icons-material/Menu';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { useSession } from '../auth/SessionContext.jsx';
import { ProfileMenu } from './ProfileMenu.jsx';

/**
 * The shell's top header: a hamburger control that toggles navigation at
 * every width, a tenant/operator label immediately to its right, and the
 * profile menu (I0001-R009). Spans the full width, with the nav and work
 * area sitting in the row below it — see `AppShell`.
 * @param {{onMenuClick: () => void}} props
 * @returns {JSX.Element}
 */
export function TopHeader({ onMenuClick }) {
  const navigate = useNavigate();
  const session = useSession();

  return (
    <AppBar
      position="static"
      color="default"
      elevation={0}
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Toolbar sx={{ gap: 1 }}>
        <IconButton
          edge="start"
          aria-label="Toggle navigation"
          onClick={onMenuClick}
        >
          <MenuIcon />
        </IconButton>
        {session.selectedTenant ? (
          <Button
            variant="text"
            onClick={() => navigate('/tenants')}
            aria-label={`Selected tenant: ${session.selectedTenant.name}. Open tenant selection.`}
          >
            {session.selectedTenant.name}
          </Button>
        ) : session.operator && session.entryPoints?.tenant ? (
          <Button
            variant="text"
            onClick={() => navigate('/tenants')}
            aria-label={`${session.operator.name}. Open tenant selection.`}
          >
            {session.operator.name}
          </Button>
        ) : session.operator ? (
          <Typography variant="body2" color="text.secondary">
            {session.operator.name}
          </Typography>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <ProfileMenu />
      </Toolbar>
    </AppBar>
  );
}
