/**
 * @file Sidebar — collapsible navigation with flyout menus per PRD §2.3
 * @module nap-client/components/layout/Sidebar
 *
 * Visual styling via theme overrides (MuiDrawer, MuiListItemButton, MuiListItemIcon).
 * Layout dimensions via layoutTokens. Active-state highlighting stays inline (dynamic).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  IconButton,
  Tooltip,
  Popover,
  Typography,
} from '@mui/material';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { NAV_ITEMS } from '../../config/navigationConfig.js';
import { useAuth } from '../../contexts/AuthContext.jsx';
import {
  SIDEBAR_WIDTH_EXPANDED,
  SIDEBAR_WIDTH_COLLAPSED,
  TENANT_BAR_HEIGHT,
  FONT,
  sidebarPaperSx,
} from '../../config/layoutTokens.js';

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const [flyout, setFlyout] = useState({ anchorEl: null, group: null });
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;

  // Filter nav items based on user capabilities.
  // super_user always sees everything. When perms.caps is not yet populated
  // (e.g. /me response omits it), fall back to showing all items so the
  // sidebar isn't empty while the server-side RBAC still enforces access.
  const filteredNav = useMemo(() => {
    if (!user) return [];
    if (user.role === 'super_user') return NAV_ITEMS;
    const caps = user.perms?.caps || {};
    const capKeys = Object.keys(caps);
    if (capKeys.length === 0) return NAV_ITEMS;

    const hasCap = (capability) => {
      if (!capability) return true;
      const parts = capability.split('::');
      const moduleKey = parts[0];
      const routerKey = parts[1] || '';
      if (routerKey) {
        return capKeys.some((k) => {
          const [m, r] = k.split('::');
          return m === moduleKey && r === routerKey;
        });
      }
      return capKeys.some((k) => k.startsWith(`${moduleKey}::`));
    };

    const filterChildren = (children) =>
      children
        .map((child) => {
          if (child.children) {
            const filtered = filterChildren(child.children);
            return filtered.length > 0 ? { ...child, children: filtered } : null;
          }
          return hasCap(child.capability) ? child : null;
        })
        .filter(Boolean);

    return NAV_ITEMS.map((group) => ({ ...group, children: filterChildren(group.children) }))
      .filter((group) => group.children.length > 0);
  }, [user]);

  const toggleGroup = (label) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

  const handleFlyoutOpen = (e, group) => {
    if (!collapsed) return;
    setFlyout({ anchorEl: e.currentTarget, group });
  };

  const handleFlyoutClose = () => {
    setFlyout({ anchorEl: null, group: null });
  };

  return (
    <Drawer
      variant="permanent"
      sx={{
        width,
        flexShrink: 0,
        '& .MuiDrawer-paper': sidebarPaperSx(width),
      }}
    >
      {/* Logo / brand */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          px: collapsed ? 1 : 2,
          py: 1.5,
          minHeight: TENANT_BAR_HEIGHT,
        }}
      >
        {!collapsed && (
          <Typography variant="h6" color="primary" fontWeight={700} noWrap>
            NAP
          </Typography>
        )}
        <IconButton size="small" onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </Box>

      {/* Navigation groups */}
      <List component="nav" sx={{ px: collapsed ? 0.5 : 1, pt: 0 }}>
        {filteredNav.map((group) => {
          const GroupIcon = group.icon;
          const isGroupActive = group.children.some((c) =>
            c.children ? c.children.some((leaf) => isActive(leaf.path)) : isActive(c.path),
          );

          return collapsed ? (
            /* Collapsed: icon-only with flyout */
            <Box key={group.label}>
              <Tooltip title={group.label} placement="right">
                <ListItemButton
                  sx={{
                    justifyContent: 'center',
                    mb: 0.5,
                    bgcolor: isGroupActive ? 'action.selected' : 'transparent',
                  }}
                  onClick={(e) => handleFlyoutOpen(e, group)}
                >
                  <ListItemIcon sx={{ minWidth: 0, color: isGroupActive ? 'primary.main' : 'text.secondary' }}>
                    <GroupIcon />
                  </ListItemIcon>
                </ListItemButton>
              </Tooltip>
            </Box>
          ) : (
            /* Expanded: full labels with collapse */
            <Box key={group.label}>
              <ListItemButton
                onClick={() => toggleGroup(group.label)}
                sx={{ mb: 0.25 }}
              >
                <ListItemIcon sx={{ color: isGroupActive ? 'primary.main' : 'text.secondary' }}>
                  <GroupIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={group.label}
                  primaryTypographyProps={{
                    ...FONT.navGroup,
                    fontWeight: isGroupActive ? 600 : 400,
                    color: isGroupActive ? 'primary.main' : 'text.primary',
                  }}
                />
                {openGroups[group.label] ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
              </ListItemButton>

              <Collapse in={openGroups[group.label]} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {group.children.map((child) =>
                    child.children ? (
                      /* Sub-group (3rd level) */
                      <Box key={child.label}>
                        <ListItemButton
                          onClick={() => toggleGroup(`${group.label}/${child.label}`)}
                          sx={{ pl: 6, py: 0.5, mb: 0.25 }}
                        >
                          <ListItemText
                            primary={child.label}
                            primaryTypographyProps={{
                              ...FONT.navItem,
                              fontWeight: child.children.some((leaf) => isActive(leaf.path)) ? 600 : 400,
                              color: child.children.some((leaf) => isActive(leaf.path))
                                ? 'primary.main'
                                : 'text.secondary',
                            }}
                          />
                          {openGroups[`${group.label}/${child.label}`] ? (
                            <ExpandLess fontSize="small" sx={{ color: 'text.secondary' }} />
                          ) : (
                            <ExpandMore fontSize="small" sx={{ color: 'text.secondary' }} />
                          )}
                        </ListItemButton>
                        <Collapse
                          in={openGroups[`${group.label}/${child.label}`]}
                          timeout="auto"
                          unmountOnExit
                        >
                          <List component="div" disablePadding>
                            {child.children.map((leaf) => (
                              <ListItemButton
                                key={leaf.path}
                                sx={{
                                  pl: 8,
                                  py: 0.5,
                                  mb: 0.25,
                                  bgcolor: isActive(leaf.path) ? 'action.selected' : 'transparent',
                                }}
                                onClick={() => navigate(leaf.path)}
                              >
                                <ListItemText
                                  primary={leaf.label}
                                  primaryTypographyProps={{
                                    ...FONT.navItem,
                                    fontWeight: isActive(leaf.path) ? 600 : 400,
                                    color: isActive(leaf.path) ? 'primary.main' : 'text.secondary',
                                  }}
                                />
                              </ListItemButton>
                            ))}
                          </List>
                        </Collapse>
                      </Box>
                    ) : (
                      /* Leaf item (2nd level) */
                      <ListItemButton
                        key={child.path}
                        sx={{
                          pl: 6,
                          py: 0.5,
                          mb: 0.25,
                          bgcolor: isActive(child.path) ? 'action.selected' : 'transparent',
                        }}
                        onClick={() => navigate(child.path)}
                      >
                        <ListItemText
                          primary={child.label}
                          primaryTypographyProps={{
                            ...FONT.navItem,
                            fontWeight: isActive(child.path) ? 600 : 400,
                            color: isActive(child.path) ? 'primary.main' : 'text.secondary',
                          }}
                        />
                      </ListItemButton>
                    ),
                  )}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </List>

      {/* Flyout popover for collapsed sidebar */}
      <Popover
        open={Boolean(flyout.anchorEl)}
        anchorEl={flyout.anchorEl}
        onClose={handleFlyoutClose}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { ml: 0.5, minWidth: 180 } } }}
      >
        {flyout.group && (
          <List dense>
            <ListItemButton disabled>
              <ListItemText
                primary={flyout.group.label}
                primaryTypographyProps={{ fontWeight: 700, ...FONT.navGroup }}
              />
            </ListItemButton>
            {flyout.group.children.map((child) =>
              child.children ? (
                <Box key={child.label}>
                  <ListItemButton disabled sx={{ pt: 1 }}>
                    <ListItemText
                      primary={child.label}
                      primaryTypographyProps={{ fontWeight: 600, ...FONT.navItem, color: 'text.secondary' }}
                    />
                  </ListItemButton>
                  {child.children.map((leaf) => (
                    <ListItemButton
                      key={leaf.path}
                      onClick={() => {
                        navigate(leaf.path);
                        handleFlyoutClose();
                      }}
                      sx={{ pl: 4, bgcolor: isActive(leaf.path) ? 'action.selected' : 'transparent' }}
                    >
                      <ListItemText
                        primary={leaf.label}
                        primaryTypographyProps={{
                          ...FONT.navItem,
                          color: isActive(leaf.path) ? 'primary.main' : 'text.primary',
                        }}
                      />
                    </ListItemButton>
                  ))}
                </Box>
              ) : (
                <ListItemButton
                  key={child.path}
                  onClick={() => {
                    navigate(child.path);
                    handleFlyoutClose();
                  }}
                  sx={{ bgcolor: isActive(child.path) ? 'action.selected' : 'transparent' }}
                >
                  <ListItemText
                    primary={child.label}
                    primaryTypographyProps={{
                      ...FONT.navItem,
                      color: isActive(child.path) ? 'primary.main' : 'text.primary',
                    }}
                  />
                </ListItemButton>
              ),
            )}
          </List>
        )}
      </Popover>
    </Drawer>
  );
}
