/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import { Menu as MenuIcon, Search as SearchIcon } from '@mui/icons-material';
import { Wordmark } from './Wordmark';
import { EntitySwitcher } from './EntitySwitcher';
import { ProjectSwitcher } from './ProjectSwitcher';
import { UserMenu } from './UserMenu';

export function TopBar({ onToggleRail }: { onToggleRail: () => void }) {
  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        color: 'text.primary',
        borderBottom: 1,
        borderColor: 'divider',
        zIndex: theme => theme.zIndex.drawer + 1,
      }}
    >
      <Toolbar sx={{ gap: 2 }}>
        <IconButton
          edge="start"
          onClick={onToggleRail}
          aria-label="Toggle navigation"
        >
          <MenuIcon />
        </IconButton>
        <Wordmark />
        <Box sx={{ display: 'flex', gap: 1.5, ml: 3 }}>
          <EntitySwitcher />
          <ProjectSwitcher />
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        {/* Command palette is future work (PRD 0001 out of scope) — inert. */}
        <TextField
          size="small"
          placeholder="Search…  ⌘K"
          disabled
          sx={{ width: 220 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
        <UserMenu />
      </Toolbar>
    </AppBar>
  );
}
