/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useId, useState } from 'react';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { useTheme } from '@mui/material/styles';
import { activeIndicatorSx } from './navStyles.js';

/**
 * A two-level nav group (I0001-R023). Hidden entirely when it has no
 * visible children — the caller is responsible for filtering `children` to
 * ones whose destination is implemented and server-authorized; this
 * component never decides that on its own.
 *
 * Expanded (phone drawer or the expanded rail): an accordion — the group
 * header shows an icon, label, and a chevron; its children nest beneath it
 * with icons and labels, and are removed from the tab order while
 * collapsed.
 *
 * Collapsed rail: the group is a single icon button with a tooltip. Clicking
 * it (mouse, touch, or Enter/Space via keyboard) opens a flyout menu listing
 * the visible children with icons and labels; the menu supplies its own
 * arrow-key navigation, Escape-to-close, and focus return to the trigger.
 * @param {{
 *   icon: import('react').ReactNode,
 *   label: string,
 *   expanded: boolean,
 *   children: Array<{id: string, icon: import('react').ReactNode, label: string, active: boolean}>,
 *   onSelect: (id: string) => void,
 * }} props
 * @returns {JSX.Element|null}
 */
export function NavGroup({ icon, label, expanded, children, onSelect }) {
  const theme = useTheme();
  const listId = useId();
  const [open, setOpen] = useState(true);
  const [anchorEl, setAnchorEl] = useState(null);

  if (children.length === 0) return null;

  const groupActive = children.some(child => child.active);

  if (expanded)
    return (
      <>
        <ListItemButton
          onClick={() => setOpen(value => !value)}
          aria-expanded={open}
          aria-controls={listId}
          sx={{ ...activeIndicatorSx(theme), minHeight: 44 }}
          selected={groupActive}
        >
          <ListItemIcon sx={{ minWidth: 0, mr: 2 }}>{icon}</ListItemIcon>
          <ListItemText primary={label} />
          {open ? (
            <ExpandLessIcon fontSize="small" />
          ) : (
            <ExpandMoreIcon fontSize="small" />
          )}
        </ListItemButton>
        <Collapse in={open} timeout="auto" unmountOnExit>
          <List component="div" disablePadding id={listId}>
            {children.map(child => (
              <ListItemButton
                key={child.id}
                selected={child.active}
                onClick={() => onSelect(child.id)}
                aria-label={child.label}
                sx={{ ...activeIndicatorSx(theme), minHeight: 40, pl: 4 }}
              >
                <ListItemIcon sx={{ minWidth: 0, mr: 2 }}>
                  {child.icon}
                </ListItemIcon>
                <ListItemText primary={child.label} />
              </ListItemButton>
            ))}
          </List>
        </Collapse>
      </>
    );

  const menuOpen = Boolean(anchorEl);
  return (
    <>
      <Tooltip title={label} placement="right" disableHoverListener={menuOpen}>
        <ListItemButton
          selected={groupActive}
          onClick={event => setAnchorEl(event.currentTarget)}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          sx={{
            ...activeIndicatorSx(theme),
            minHeight: 44,
            justifyContent: 'center',
            px: 1,
          }}
        >
          <ListItemIcon sx={{ minWidth: 0, justifyContent: 'center' }}>
            {icon}
          </ListItemIcon>
        </ListItemButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        MenuListProps={{ 'aria-label': label }}
      >
        {children.map(child => (
          <MenuItem
            key={child.id}
            selected={child.active}
            onClick={() => {
              setAnchorEl(null);
              onSelect(child.id);
            }}
          >
            <ListItemIcon sx={{ minWidth: 32 }}>{child.icon}</ListItemIcon>
            <ListItemText>{child.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
