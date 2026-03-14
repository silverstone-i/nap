/**
 * @file Per-row kebab (⋮) menu for DataTable row actions
 * @module nap-client/components/shared/RowActionsMenu
 *
 * Renders a MoreVert IconButton that opens a dropdown of actions.
 * Visibility on hover is controlled by theme overrides on .row-actions-cell,
 * not inline styles.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState } from 'react';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import MoreVertIcon from '@mui/icons-material/MoreVert';

/**
 * @param {Object} props
 * @param {Object} props.row               - DataGrid row object
 * @param {Array}  props.actions           - [{ label, icon?, onClick(row) }]
 */
export default function RowActionsMenu({ row, actions }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const handleOpen = (event) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => setAnchorEl(null);

  const handleAction = (action) => {
    handleClose();
    action.onClick(row);
  };

  if (!actions || actions.length === 0) return null;

  return (
    <>
      <IconButton size="small" onClick={handleOpen} className="row-actions-btn" aria-label="Row actions">
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {actions.map((action) => (
          <MenuItem key={action.label} onClick={() => handleAction(action)}>
            {action.icon && <ListItemIcon>{action.icon}</ListItemIcon>}
            <ListItemText>{action.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
