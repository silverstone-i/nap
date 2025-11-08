import React, { useCallback, useMemo, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Box, Typography, Alert, CircularProgress } from '@mui/material';
import { DataGrid, GridOverlay } from '@mui/x-data-grid';
import { useTheme } from '@mui/material/styles';
import { useModuleActionsContext } from '../../context/ModuleActionsContext.jsx';

export const RESOURCE_SELECTION_MODES = {
  NONE: 'none',
  SINGLE: 'single',
  MULTIPLE: 'multiple'
};

export const DEFAULT_PAGE_SIZE_OPTIONS = [5, 10, 25];

export function useRowIdLookup(rows, getRowId) {
  return useMemo(() => {
    try {
      return new Map(rows.map((row) => [getRowId(row), row]));
    } catch (err) {
      console.error('Failed to derive row ids for ResourceGrid.', err);
      return new Map();
    }
  }, [rows, getRowId]);
}

const defaultGetRowId = (row) => row?.id ?? row?.key ?? row?.uuid;

function OverlayMessage({ title, description, showSpinner }) {
  return (
    <GridOverlay>
      <Box
        sx={{
          p: 3,
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1.5
        }}
      >
        {showSpinner && <CircularProgress size={24} />}
        {title && (
          <Typography variant="subtitle1" color="text.secondary" fontWeight={600}>
            {title}
          </Typography>
        )}
        {description && (
          <Typography variant="body2" color="text.secondary">
            {description}
          </Typography>
        )}
      </Box>
    </GridOverlay>
  );
}

OverlayMessage.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  showSpinner: PropTypes.bool
};

function usePaginationModel(initialPageSize) {
  const [paginationModel, setPaginationModel] = useState({
    pageSize: initialPageSize,
    page: 0
  });

  useEffect(() => {
    setPaginationModel((current) => ({
      ...current,
      pageSize: initialPageSize
    }));
  }, [initialPageSize]);

  return [paginationModel, setPaginationModel];
}

export default function ResourceGrid({
  title,
  columns = [],
  rows = [],
  getRowId = defaultGetRowId,
  toolbarActions = [],
  selectionMode = RESOURCE_SELECTION_MODES.MULTIPLE,
  pagination = {},
  loading = false,
  error = null,
  emptyState,
  onSelectionChange,
  onCellEditCommit,
  onRowEditStop,
  processRowUpdate,
  slots,
  slotProps,
  sx,
  ...gridProps
}) {
  const theme = useTheme();
  const moduleActions = useModuleActionsContext();
  const initialPageSize = pagination.initialPageSize ?? 10;
  const pageSizeOptions = pagination.pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS;
  const [paginationModel, setPaginationModel] = usePaginationModel(initialPageSize);
  const rowLookup = useRowIdLookup(rows, getRowId);

  const [selectionModel, setSelectionModel] = useState([]);
  const selectedRows = useMemo(
    () => selectionModel.map((id) => rowLookup.get(id)).filter(Boolean),
    [selectionModel, rowLookup]
  );
  const selectedCount = selectedRows.length;

  useEffect(() => {
    setSelectionModel((current) => current.filter((id) => rowLookup.has(id)));
  }, [rowLookup]);

  const gridColumns = useMemo(
    () =>
      columns.map((col) => ({
        flex: col.flex,
        minWidth: col.minWidth,
        width: col.width,
        ...col
      })),
    [columns]
  );

  const handleSelectionModelChange = useCallback(
    (newSelection) => {
      if (selectionMode === RESOURCE_SELECTION_MODES.NONE) {
        return;
      }

      const normalizedSelection = Array.isArray(newSelection)
        ? newSelection
        : typeof newSelection === 'string' || typeof newSelection === 'number'
        ? [newSelection]
        : [];

      const nextSelection =
        selectionMode === RESOURCE_SELECTION_MODES.SINGLE && normalizedSelection.length > 1
          ? [normalizedSelection[normalizedSelection.length - 1]]
          : normalizedSelection;

      setSelectionModel(nextSelection);

      if (onSelectionChange) {
        onSelectionChange(nextSelection, nextSelection.map((id) => rowLookup.get(id)).filter(Boolean));
      }
    },
    [selectionMode, onSelectionChange, rowLookup]
  );

  const computedToolbarActions = useMemo(() => {
    if (!toolbarActions?.length) {
      return [];
    }

    return toolbarActions.map((action) => {
      const requireSelection = action.requireSelection ?? false;
      const minSelected = action.minSelected ?? (requireSelection ? 1 : 0);
      const maxSelected = action.maxSelected ?? Infinity;
      const selectionUnavailable = selectionMode === RESOURCE_SELECTION_MODES.NONE;
      const selectionDisabled =
        selectionUnavailable ||
        selectedCount < minSelected ||
        (Number.isFinite(maxSelected) && selectedCount > maxSelected);

      return {
        ...action,
        disabled: action.disabled ?? selectionDisabled,
        onClick: (event) => {
          if (typeof action.onClick === 'function') {
            action.onClick(event, {
              selectedIds: selectionModel,
              selectedRows,
              selectionMode
            });
          }
        }
      };
    });
  }, [toolbarActions, selectedCount, selectionModel, selectedRows, selectionMode]);

  useEffect(() => {
    if (typeof moduleActions?.setActions !== 'function') {
      return undefined;
    }

    if (!toolbarActions?.length) {
      moduleActions.setActions(null);
      return () => {
        moduleActions.setActions(null);
      };
    }

    moduleActions.setActions(computedToolbarActions);
    return () => {
      moduleActions.setActions(null);
    };
  }, [moduleActions?.setActions, computedToolbarActions, toolbarActions]);

  const shouldShowHeader = Boolean(title) || (selectionMode !== RESOURCE_SELECTION_MODES.NONE && selectedCount > 0);

  const mergedSlots = {
    loadingOverlay: () => <OverlayMessage title="Loading resources" description="Fetching the latest data." showSpinner />,
    noRowsOverlay: () =>
      emptyState || <OverlayMessage title="No rows to display" description="Add a record or adjust your filters." />,
    ...slots
  };

  const mergedSlotProps = {
    ...slotProps
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, width: '100%' }}>
      {shouldShowHeader && (
        <Box
          sx={{
            mb: 2,
            display: 'flex',
            alignItems: { xs: 'flex-start', sm: 'center' },
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            gap: 1
          }}
        >
          {title && (
            <Typography variant="h4" component="h1">
              {title}
            </Typography>
          )}
          {selectionMode !== RESOURCE_SELECTION_MODES.NONE && selectedCount > 0 && (
            <Typography variant="body2" color="text.secondary">
              {selectedCount} selected
            </Typography>
          )}
        </Box>
      )}

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          variant="outlined"
        >
          {typeof error === 'string' ? error : 'Something went wrong while loading this resource.'}
        </Alert>
      )}

      <Box
        sx={{
          flexGrow: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          width: '100%'
        }}
      >
        <DataGrid
          rows={rows}
          columns={gridColumns}
          getRowId={getRowId}
          checkboxSelection={selectionMode === RESOURCE_SELECTION_MODES.MULTIPLE}
          disableMultipleRowSelection={selectionMode === RESOURCE_SELECTION_MODES.SINGLE}
          isRowSelectable={selectionMode === RESOURCE_SELECTION_MODES.NONE ? () => false : undefined}
          disableRowSelectionOnClick={selectionMode === RESOURCE_SELECTION_MODES.NONE}
          rowSelectionModel={selectionMode === RESOURCE_SELECTION_MODES.NONE ? [] : selectionModel}
          onRowSelectionModelChange={handleSelectionModelChange}
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={pageSizeOptions}
          loading={loading}
          processRowUpdate={processRowUpdate}
          onRowEditStop={onRowEditStop}
          onCellEditCommit={onCellEditCommit}
          slots={mergedSlots}
          slotProps={mergedSlotProps}
          sx={{
            border: 'none',
            flexGrow: 1,
            width: '100%',
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: theme.palette.background.surface,
              borderBottom: `1px solid ${theme.palette.divider}`
            },
            '& .MuiDataGrid-footerContainer': {
              borderTop: `1px solid ${theme.palette.divider}`
            },
            '& .MuiDataGrid-cell': {
              borderBottom: `1px solid ${theme.palette.divider}`
            },
            '& .MuiDataGrid-virtualScroller': {
              backgroundColor: theme.palette.background.paper,
              flexGrow: 1
            },
            '& .MuiDataGrid-row.Mui-selected': {
              backgroundColor: `${theme.palette.primary.main}22`,
              '&:hover': {
                backgroundColor: `${theme.palette.primary.main}33`
              }
            },
            '& .MuiDataGrid-checkboxInput.MuiCheckbox-root': {
              color: theme.palette.primary.main
            },
            ...sx
          }}
          {...gridProps}
        />
      </Box>
    </Box>
  );
}

ResourceGrid.propTypes = {
  title: PropTypes.string,
  columns: PropTypes.arrayOf(PropTypes.object).isRequired,
  rows: PropTypes.arrayOf(PropTypes.object),
  getRowId: PropTypes.func,
  toolbarActions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string,
      label: PropTypes.string.isRequired,
      icon: PropTypes.node,
      requireSelection: PropTypes.bool,
      minSelected: PropTypes.number,
      maxSelected: PropTypes.number,
      onClick: PropTypes.func
    })
  ),
  selectionMode: PropTypes.oneOf(Object.values(RESOURCE_SELECTION_MODES)),
  pagination: PropTypes.shape({
    initialPageSize: PropTypes.number,
    pageSizeOptions: PropTypes.arrayOf(PropTypes.number)
  }),
  loading: PropTypes.bool,
  error: PropTypes.oneOfType([PropTypes.string, PropTypes.node]),
  emptyState: PropTypes.node,
  onSelectionChange: PropTypes.func,
  onCellEditCommit: PropTypes.func,
  onRowEditStop: PropTypes.func,
  processRowUpdate: PropTypes.func,
  slots: PropTypes.object,
  slotProps: PropTypes.object,
  sx: PropTypes.object
};
