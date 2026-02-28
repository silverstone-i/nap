/**
 * @file Archive / restore handler hook for DataGrid CRUD pages
 * @module nap-client/hooks/useArchiveRestore
 *
 * Encapsulates the open/close state for archive & restore confirm dialogs,
 * the async handlers that loop over selectedRows, and ready-to-spread
 * ConfirmDialog props.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState } from 'react';

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const defaultErrMsg = (err) => err.payload?.error || err.payload?.message || err.message;

/**
 * @param {Object}   opts
 * @param {Array}    opts.selectedRows      – from useDataGridSelection
 * @param {Object}   opts.archiveMut        – TanStack mutation (useArchiveX)
 * @param {Object}   [opts.restoreMut]      – TanStack mutation (useRestoreX); omit for archive-only pages
 * @param {string}   opts.entityName        – singular, lowercase (e.g. 'vendor')
 * @param {string}   [opts.entityNamePlural] – defaults to entityName + 's'
 * @param {Function} opts.setSelectionModel – from useDataGridSelection
 * @param {Function} opts.toast             – (msg, severity?) toast callback
 * @param {Function} [opts.errMsg]          – error message extractor; sensible default provided
 * @param {Function} [opts.getLabel]        – (row) => string for single-record confirm messages
 * @returns {{ archiveOpen, setArchiveOpen, restoreOpen, setRestoreOpen, handleArchive, handleRestore, archiveConfirmProps, restoreConfirmProps }}
 */
export function useArchiveRestore({
  selectedRows,
  archiveMut,
  restoreMut,
  entityName,
  entityNamePlural,
  setSelectionModel,
  toast,
  errMsg = defaultErrMsg,
  getLabel,
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const plural = entityNamePlural || entityName + 's';
  const hasSelection = selectedRows.length > 0;

  const handleArchive = async () => {
    try {
      const targets = selectedRows.filter((r) => !r.deactivated_at);
      for (const row of targets) await archiveMut.mutateAsync({ id: row.id });
      toast(targets.length === 1 ? `${cap(entityName)} archived` : `${targets.length} ${plural} archived`);
      setArchiveOpen(false);
      setSelectionModel([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const handleRestore = async () => {
    if (!restoreMut) return;
    try {
      const targets = selectedRows.filter((r) => !!r.deactivated_at);
      for (const row of targets) await restoreMut.mutateAsync({ id: row.id });
      toast(targets.length === 1 ? `${cap(entityName)} restored` : `${targets.length} ${plural} restored`);
      setRestoreOpen(false);
      setSelectionModel([]);
    } catch (err) {
      toast(errMsg(err), 'error');
    }
  };

  const labelFn = getLabel || (() => null);

  const archiveConfirmProps = {
    open: archiveOpen,
    title: `Archive ${cap(entityName)}`,
    message: hasSelection
      ? selectedRows.length === 1
        ? labelFn(selectedRows[0])
          ? `Archive "${labelFn(selectedRows[0])}"?`
          : `Archive this ${entityName}?`
        : `Archive ${selectedRows.length} ${plural}?`
      : '',
    confirmLabel: 'Archive',
    confirmColor: 'error',
    loading: archiveMut.isPending,
    onConfirm: handleArchive,
    onCancel: () => setArchiveOpen(false),
  };

  const restoreConfirmProps = restoreMut
    ? {
        open: restoreOpen,
        title: `Restore ${cap(entityName)}`,
        message: hasSelection
          ? selectedRows.length === 1
            ? labelFn(selectedRows[0])
              ? `Restore "${labelFn(selectedRows[0])}"?`
              : `Restore this ${entityName}?`
            : `Restore ${selectedRows.length} ${plural}?`
          : '',
        confirmLabel: 'Restore',
        confirmColor: 'success',
        loading: restoreMut.isPending,
        onConfirm: handleRestore,
        onCancel: () => setRestoreOpen(false),
      }
    : null;

  return {
    archiveOpen,
    setArchiveOpen,
    restoreOpen,
    setRestoreOpen,
    handleArchive,
    handleRestore,
    archiveConfirmProps,
    restoreConfirmProps,
  };
}
