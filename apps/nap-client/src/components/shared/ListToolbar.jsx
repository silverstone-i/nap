/**
 * @file Selection-dependent toolbar for DataTable — rendered via DataGrid slots.toolbar
 * @module nap-client/components/shared/ListToolbar
 *
 * Shows a selected-count indicator with a clear button. Returns null when
 * nothing is selected so the toolbar area collapses inside the DataGrid container.
 *
 * Bulk actions (Archive / Restore) live in the ModuleBar — the toolbar only
 * provides selection feedback and optional extra actions.
 *
 * Styling lives in theme.js MuiDataGrid.styleOverrides.toolbarContainer — no sx here.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import { GridToolbarContainer } from '@mui/x-data-grid';

/**
 * @param {Object}   props
 * @param {number}   props.selectedCount
 * @param {Array}    [props.extraActions]    - [{ label, icon?, disabled?, onClick }]
 * @param {Function} [props.onClear]         - clear selection callback
 */
export default function ListToolbar({
  selectedCount = 0,
  extraActions = [],
  onClear,
}) {
  if (selectedCount === 0) return null;

  const label = selectedCount === 1 ? '1 row selected' : `${selectedCount} rows selected`;

  return (
    <GridToolbarContainer>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>

      <Box className="nap-list-toolbar-actions">
        {extraActions.map((action) => (
          <Button
            key={action.label}
            size="small"
            variant={action.variant || 'outlined'}
            color={action.color || 'primary'}
            disabled={!!action.disabled}
            onClick={action.onClick}
            startIcon={action.icon || null}
          >
            {action.label}
          </Button>
        ))}
        {onClear && (
          <IconButton size="small" onClick={onClear}>
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    </GridToolbarContainer>
  );
}
