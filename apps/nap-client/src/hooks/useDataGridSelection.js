/**
 * @file DataGrid multi-select hook — encapsulates selectionModel state + derived selection state
 * @module nap-client/hooks/useDataGridSelection
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useState } from 'react';
import { deriveSelectionState, buildMutualExclusionHandler } from '../utils/selectionUtils.js';

/**
 * Manages DataGrid row selection with multi-select support.
 *
 * For pages with root-entity mutual exclusion (ManageTenants, ManageUsers),
 * pass `entityType` to get a selection handler that enforces root exclusion.
 *
 * @param {Array} rows - visible DataGrid rows
 * @param {'tenant'|'user'} [entityType] - enables root-entity mutual exclusion
 * @returns {{ selectionModel, setSelectionModel, onSelectionChange, selectedRows, selected, isSingle, hasSelection, hasRootSelected, allActive, allArchived }}
 */
export function useDataGridSelection(rows, entityType) {
  const [selectionModel, setSelectionModel] = useState([]);

  const state = deriveSelectionState(selectionModel, rows, entityType);

  const onSelectionChange = entityType
    ? buildMutualExclusionHandler({ rows, prevModel: selectionModel, setModel: setSelectionModel, entityType })
    : setSelectionModel;

  return { selectionModel, setSelectionModel, onSelectionChange, ...state };
}
