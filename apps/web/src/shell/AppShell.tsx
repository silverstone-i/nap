/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { Outlet } from 'react-router';
import Box from '@mui/material/Box';
import Toolbar from '@mui/material/Toolbar';
import { TopBar } from './TopBar';
import { NavRail } from './NavRail';

export function AppShell() {
  const [railCollapsed, setRailCollapsed] = useState(false);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <TopBar onToggleRail={() => setRailCollapsed(c => !c)} />
      <NavRail collapsed={railCollapsed} />
      <Box component="main" sx={{ flexGrow: 1, p: 3, minWidth: 0 }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
