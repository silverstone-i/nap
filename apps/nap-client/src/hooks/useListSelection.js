/**
 * @file List selection hook — Click / Ctrl+Click / Shift+Click / checkbox handling
 * @module nap-client/hooks/useListSelection
 *
 * Drop-in replacement for useDataGridSelection with full modifier-key support.
 * Designed for use with the DataTable component (disableRowSelectionOnClick).
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { deriveSelectionState, buildMutualExclusionHandler } from '../utils/selectionUtils.js';

/**
 * @param {Array}  rows - visible DataGrid rows (must have `id` field)
 * @param {'tenant'|'user'} [entityType] - enables root-entity mutual exclusion
 * @returns {Object} selection state and handlers
 */
export function useListSelection(rows, entityType) {
  const [selectionModel, setSelectionModel] = useState([]);
  const lastClickedId = useRef(null);

  const state = deriveSelectionState(selectionModel, rows, entityType);

  const selectedIds = useMemo(() => new Set(selectionModel), [selectionModel]);

  const isSelected = useCallback((id) => selectedIds.has(id), [selectedIds]);

  const clearSelection = useCallback(() => {
    setSelectionModel([]);
    lastClickedId.current = null;
  }, []);

  /**
   * Handle row body clicks with modifier key awareness.
   * Bound to DataGrid onRowClick. Checkboxes and action cells are skipped —
   * those paths are handled by onRowSelectionModelChange and RowActionsMenu.
   */
  const handleRowClick = useCallback(
    (params, event) => {
      const target = event.target;

      // Skip checkbox clicks — handled by onRowSelectionModelChange
      if (target.closest?.('.MuiDataGrid-cellCheckbox')) return;

      // Skip actions column clicks — handled by RowActionsMenu
      if (target.closest?.('.row-actions-cell')) return;

      const id = params.id;

      if (event.shiftKey && lastClickedId.current != null) {
        // Shift+Click: range selection
        const anchorIdx = rows.findIndex((r) => r.id === lastClickedId.current);
        const targetIdx = rows.findIndex((r) => r.id === id);

        if (anchorIdx === -1) {
          // Anchor not in current view — treat as plain click
          setSelectionModel([id]);
          lastClickedId.current = id;
          return;
        }

        const start = Math.min(anchorIdx, targetIdx);
        const end = Math.max(anchorIdx, targetIdx);
        const rangeIds = rows.slice(start, end + 1).map((r) => r.id);

        // Merge with existing selection (union)
        setSelectionModel((prev) => {
          const merged = new Set(prev);
          for (const rid of rangeIds) merged.add(rid);
          return Array.from(merged);
        });
        // Do NOT update lastClickedId for shift-click
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        // Ctrl/Cmd+Click: toggle without clearing
        setSelectionModel((prev) => {
          const set = new Set(prev);
          if (set.has(id)) {
            set.delete(id);
          } else {
            set.add(id);
          }
          return Array.from(set);
        });
        lastClickedId.current = id;
        return;
      }

      // Plain click: select only this record
      setSelectionModel([id]);
      lastClickedId.current = id;
    },
    [rows],
  );

  /**
   * Handle DataGrid onRowSelectionModelChange — fires for checkbox clicks
   * (individual toggle + header select-all/deselect-all) and keyboard selection.
   */
  const handleSelectionModelChange = useMemo(() => {
    if (entityType) {
      // Wrap with mutual exclusion for root-entity pages
      return (newModel) => {
        const handler = buildMutualExclusionHandler({
          rows,
          prevModel: selectionModel,
          setModel: (model) => {
            setSelectionModel(model);
            // Update lastClickedId to the most recently added ID
            const prevSet = new Set(selectionModel);
            const added = model.filter((id) => !prevSet.has(id));
            if (added.length > 0) lastClickedId.current = added[added.length - 1];
          },
          entityType,
        });
        handler(newModel);
      };
    }

    return (newModel) => {
      // Update lastClickedId to the most recently added ID
      const prevSet = new Set(selectionModel);
      const added = newModel.filter((id) => !prevSet.has(id));
      if (added.length > 0) lastClickedId.current = added[added.length - 1];
      setSelectionModel(newModel);
    };
  }, [entityType, rows, selectionModel]);

  return {
    selectionModel,
    handleRowClick,
    handleSelectionModelChange,
    clearSelection,
    isSelected,
    ...state,
  };
}
