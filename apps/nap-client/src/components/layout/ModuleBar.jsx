/**
 * @file ModuleBar — sticky dynamic toolbar with breadcrumbs and action buttons
 * @module nap-client/components/layout/ModuleBar
 *
 * Dimensions and styling driven by layoutTokens.
 * Left zone: module name + breadcrumb trail. Right zone: tabs, filters, primary actions.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useMemo } from 'react';
import { useLocation, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Breadcrumbs,
  Link,
  Typography,
  Button,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import { NAV_ITEMS } from '../../config/navigationConfig.js';
import { useModuleActions } from '../../contexts/ModuleActionsContext.jsx';
import { FONT, moduleBarSx } from '../../config/layoutTokens.js';

/**
 * Resolve the current module name and breadcrumb segments from the route.
 */
function useBreadcrumbs() {
  const { pathname } = useLocation();

  return useMemo(() => {
    // Find matching nav group and child
    let moduleName = '';
    let childLabel = '';
    for (const group of NAV_ITEMS) {
      for (const child of group.children) {
        if (pathname === child.path || pathname.startsWith(`${child.path}/`)) {
          moduleName = group.label;
          childLabel = child.label;
          break;
        }
      }
      if (moduleName) break;
    }

    if (!moduleName) {
      // Derive from pathname
      const segments = pathname.split('/').filter(Boolean);
      moduleName = segments[0]
        ? segments[0].charAt(0).toUpperCase() + segments[0].slice(1).replace(/-/g, ' ')
        : 'Home';
    }

    const crumbs = [];
    if (moduleName) crumbs.push({ label: moduleName, path: null });
    if (childLabel && childLabel !== moduleName) {
      const matchingGroup = NAV_ITEMS.find((g) => g.label === moduleName);
      const matchingChild = matchingGroup?.children.find((c) => c.label === childLabel);
      crumbs.push({ label: childLabel, path: matchingChild?.path || null });
    }

    return { moduleName, crumbs };
  }, [pathname]);
}

export default function ModuleBar() {
  const { moduleName, crumbs } = useBreadcrumbs();
  const { actions } = useModuleActions();

  return (
    <Box
      sx={{
        ...moduleBarSx,
        zIndex: (t) => t.zIndex.appBar - 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        py: 0.75,
        gap: 2,
      }}
    >
      {/* Left: Breadcrumbs */}
      <Breadcrumbs separator={<NavigateNextIcon fontSize="small" />} sx={{ flexShrink: 0 }}>
        {crumbs.map((crumb, i) =>
          crumb.path && i < crumbs.length - 1 ? (
            <Link
              key={crumb.label}
              component={RouterLink}
              to={crumb.path}
              underline="hover"
              color="text.secondary"
              sx={FONT.toolbar}
            >
              {crumb.label}
            </Link>
          ) : (
            <Typography key={crumb.label} sx={{ ...FONT.toolbar, fontWeight: 600 }} color="text.primary">
              {crumb.label}
            </Typography>
          ),
        )}
      </Breadcrumbs>

      {/* Right: Dynamic toolbar actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
        {/* Tabs */}
        {actions.tabs.length > 0 && (
          <ToggleButtonGroup size="small" exclusive>
            {actions.tabs.map((tab) => (
              <ToggleButton
                key={tab.value}
                value={tab.value}
                selected={tab.selected}
                onClick={tab.onClick}
                sx={{ px: 1.5, py: 0.25 }}
              >
                {tab.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}

        {/* Filters */}
        {actions.filters.map((filter) => (
          <TextField
            key={filter.name}
            placeholder={filter.placeholder || filter.name}
            size="small"
            variant="outlined"
            value={filter.value || ''}
            onChange={filter.onChange}
            sx={{ minWidth: 120, '& .MuiInputBase-input': { py: 0.5, ...FONT.toolbarAction } }}
          />
        ))}

        {/* Primary actions */}
        {actions.primaryActions.map((action) => (
          <Button
            key={action.label}
            variant={action.variant || 'contained'}
            size="small"
            color={action.color || 'primary'}
            disabled={!!action.disabled}
            onClick={action.onClick}
            startIcon={action.icon || null}
          >
            {action.label}
          </Button>
        ))}
      </Box>
    </Box>
  );
}
