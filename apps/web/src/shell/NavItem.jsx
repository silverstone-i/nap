/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import { activeIndicatorSx } from './navStyles.js';

/**
 * One flat nav destination. Wrapped in a tooltip identifying the icon only
 * when collapsed to a rail — the label already does that job when expanded.
 * @param {{icon: import('react').ReactNode, label: string, active: boolean, expanded: boolean, onClick: () => void, indent?: boolean}} props
 * @returns {JSX.Element}
 */
export function NavItem({
  icon,
  label,
  active,
  expanded,
  onClick,
  indent = false,
}) {
  const theme = useTheme();
  const button = (
    <ListItemButton
      selected={active}
      onClick={onClick}
      aria-label={label}
      sx={{
        ...activeIndicatorSx(theme),
        minHeight: 44,
        justifyContent: expanded ? 'flex-start' : 'center',
        pl: expanded && indent ? 4 : expanded ? 2 : 1,
        pr: expanded ? 2 : 1,
      }}
    >
      <ListItemIcon
        sx={{
          minWidth: 0,
          mr: expanded ? 2 : 0,
          justifyContent: 'center',
        }}
      >
        {icon}
      </ListItemIcon>
      {expanded ? <ListItemText primary={label} /> : null}
    </ListItemButton>
  );
  return expanded ? (
    button
  ) : (
    <Tooltip title={label} placement="right">
      {button}
    </Tooltip>
  );
}
