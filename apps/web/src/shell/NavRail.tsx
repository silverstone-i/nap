/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import type { Theme } from '@mui/material/styles';
import Badge from '@mui/material/Badge';
import Collapse from '@mui/material/Collapse';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import {
  Inbox as InboxIcon,
  Folder as FolderIcon,
  ReceiptLong as ReceiptLongIcon,
  AccountBalance as AccountBalanceIcon,
  ExpandLess,
  ExpandMore,
} from '@mui/icons-material';
import { getInboxItems } from '../mocks/data';
import { useScope } from './useScope';
import { gold } from '../theme/tokens';

export const RAIL_WIDTH = 240;
export const RAIL_WIDTH_COLLAPSED = 64;

/**
 * Active-item styling: the 2px gold left bar is the single active-nav
 * indicator (gold use #2). Detail-page tabs therefore keep the navy default.
 */
const activeSx = {
  '&.active': {
    bgcolor: (theme: Theme) => theme.tokens.subtle,
    fontWeight: 500,
    boxShadow: `inset 2px 0 0 0 ${gold}`,
  },
} as const;

function RailLink({
  to,
  icon,
  label,
  collapsed,
  indent = false,
  end = false,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  indent?: boolean;
  end?: boolean;
}) {
  return (
    <ListItemButton
      component={NavLink}
      to={to}
      end={end}
      sx={{ pl: indent && !collapsed ? 4 : 2, ...activeSx }}
    >
      <ListItemIcon sx={{ minWidth: 40 }}>{icon}</ListItemIcon>
      {!collapsed && <ListItemText primary={label} />}
    </ListItemButton>
  );
}

export function NavRail({ collapsed }: { collapsed: boolean }) {
  const { entityId, projectId } = useScope();
  const location = useLocation();
  const [apOpen, setApOpen] = useState(true);
  // Scoped to the active project filter so the badge always matches the
  // list the Inbox link (which carries ?project=) opens.
  const inboxCount = getInboxItems(entityId, projectId).length;

  // Preserve the project filter across module navigation within an entity.
  const search = projectId ? `?project=${projectId}` : '';
  const inAp = location.pathname.startsWith(`/${entityId}/ap/`);

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: collapsed ? RAIL_WIDTH_COLLAPSED : RAIL_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: collapsed ? RAIL_WIDTH_COLLAPSED : RAIL_WIDTH,
          overflowX: 'hidden',
          transition: theme =>
            theme.transitions.create('width', { duration: 160 }),
        },
      }}
    >
      <Toolbar />
      <List component="nav" disablePadding>
        <RailLink
          to={`/${entityId}/inbox${search}`}
          icon={
            <Badge badgeContent={inboxCount} color="primary">
              <InboxIcon fontSize="small" />
            </Badge>
          }
          label="Inbox"
          collapsed={collapsed}
        />
        <RailLink
          to={`/${entityId}/projects${search}`}
          icon={<FolderIcon fontSize="small" />}
          label="Projects"
          collapsed={collapsed}
        />
        <ListItemButton
          onClick={() => setApOpen(open => !open)}
          sx={{ pl: 2 }}
          selected={collapsed && inAp}
        >
          <ListItemIcon sx={{ minWidth: 40 }}>
            <AccountBalanceIcon fontSize="small" />
          </ListItemIcon>
          {!collapsed && (
            <>
              <ListItemText primary="Accounts Payable" />
              {apOpen ? (
                <ExpandLess fontSize="small" />
              ) : (
                <ExpandMore fontSize="small" />
              )}
            </>
          )}
        </ListItemButton>
        <Collapse in={apOpen || collapsed} timeout="auto">
          <RailLink
            to={`/${entityId}/ap/invoices${search}`}
            icon={<ReceiptLongIcon fontSize="small" />}
            label="Invoices"
            collapsed={collapsed}
            indent
          />
        </Collapse>
      </List>
    </Drawer>
  );
}
