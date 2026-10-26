/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import ArchiveIcon from '@mui/icons-material/Archive';
import EditIcon from '@mui/icons-material/Edit';
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash';
import { ApiError } from '../../api/client.js';
import {
  archiveRole,
  bulkRoleAction,
  getRole,
  listRoles,
  restoreRole,
} from '../../api/endpoints.js';
import { useSession } from '../../auth/SessionContext.jsx';
import { useCapabilities } from '../../auth/useCapabilities.js';
import { ArchiveViewTabs } from '../../grid/ArchiveViewTabs.jsx';
import { ConfirmDialog } from '../../grid/ConfirmDialog.jsx';
import { createListPageAdapter } from '../../grid/listPageAdapter.js';
import { useArchiveView } from '../../grid/useArchiveView.js';
import { useSearchFromUrl } from '../../grid/useSearchFromUrl.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import {
  ALREADY_IN_STATE,
  useBulkArchive,
} from '../../grid/useBulkArchive.jsx';
import { useNotice } from '../../shell/NoticeContext.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { useDebouncedValue } from '../../shell/useDebouncedValue.js';
import { RoleBadges } from './RoleBadges.jsx';
import { RoleDetailDialog } from './RoleDetailDialog.jsx';
import { RoleFormDialog } from './RoleFormDialog.jsx';
import { describeRoleError, isStaleRevision } from './roleErrors.js';

/** M0003-R022: what Archive tells the user before it runs. */
const ARCHIVE_TEXT = 'An archived role grants nothing until it is restored.';

/**
 * The role grid's columns. Selecting a role's name opens its detail
 * (I0001-R031).
 * @param {(role: object) => void} onOpen
 * @returns {object[]}
 */
function columnsFor(onOpen) {
  const plain = { sortable: false, filterable: false };
  return [
    {
      ...plain,
      field: 'name',
      headerName: 'Name',
      flex: 2,
      priority: 'essential',
      // M0003-R025: an immutable role says so beside its name.
      renderCell: ({ row }) => (
        <Stack
          direction="row"
          spacing={1}
          sx={{ alignItems: 'center', height: '100%' }}
        >
          <Button variant="text" size="small" onClick={() => onOpen(row)}>
            {row.name}
          </Button>
          <RoleBadges role={row} showArchived={false} />
        </Stack>
      ),
    },
    {
      ...plain,
      field: 'code',
      headerName: 'Code',
      flex: 1,
      priority: 'secondary',
    },
    {
      ...plain,
      field: 'grants',
      headerName: 'Grants',
      width: 90,
      priority: 'secondary',
      valueGetter: grants => grants.length,
    },
  ];
}

/**
 * `/settings/roles` (M0003-R016–R018): the selected tenant's roles in a
 * standard grid, their detail, create / edit / archive / restore one or a
 * page of them. Assignments live on each person's detail (M0003-R021). The header holds the name
 * search, the bulk actions, and New role, with Active and Archived tabs
 * below that switch the view, kept in the URL (I0011-R001–R005). Every call
 * is scoped server-side to the session's selected tenant.
 */
export function RolesPage() {
  const session = useSession();
  const tenant = session.selectedTenant;
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useArchiveView();
  useSearchFromUrl(setSearch);
  const [actionError, setActionError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const { can, onError } = useCapabilities();
  const notify = useNotice();
  const canWrite = can('access-control::roles::write');
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(key => key + 1);

  const needle = useDebouncedValue(search.trim().toLowerCase());
  // One load per server query; the search filters it in the browser.
  const adapter = useMemo(
    () => createListPageAdapter(() => listRoles({ archived })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a reload or a new tenant loads afresh
    [archived, reloadKey, tenant?.id]
  );
  const fetchPage = useMemo(
    () => params =>
      adapter({
        ...params,
        keep: role =>
          role.name.toLowerCase().includes(needle) ||
          role.code.toLowerCase().includes(needle),
      }),
    [adapter, needle]
  );
  // I0011-R006: a view switch clears the selection and returns to page one.
  const resetKey = `${tenant?.id}:${archived}:${needle}:${reloadKey}`;

  const bulk = useBulkArchive({
    canWrite,
    noun: ['role', 'roles'],
    nameOf: role => role.name,
    run: bulkRoleAction,
    describeError: describeRoleError,
    describeItem: (code, action) =>
      code === 'INVALID_STATE'
        ? ALREADY_IN_STATE[action]
        : describeRoleError(new ApiError(code, 409)),
    archiveText: ARCHIVE_TEXT,
    onDone: reload,
    onError,
    archived,
  });

  /**
   * Run a lifecycle action on `role`, then reload and report it as a notice
   * (M0003-R023), or report the failure.
   */
  async function runLifecycle(action, role) {
    setActionError(null);
    try {
      const saved = await action(role.id, role.revision);
      notify(
        `${role.name} ${action === archiveRole ? 'archived' : 'restored'}.`
      );
      if (selected) setSelected(saved);
      reload();
    } catch (err) {
      onError(err);
      setActionError(describeRoleError(err));
      if (isStaleRevision(err)) {
        if (selected) {
          try {
            setSelected(await getRole(role.id));
          } catch {
            // Keep the stale view; the list reload below still refreshes.
          }
        }
        reload();
      }
    }
  }

  function rowActions(role) {
    if (!canWrite || role.isImmutable) return [];
    return role.archived
      ? [
          {
            label: 'Restore',
            icon: <RestoreFromTrashIcon fontSize="small" />,
            onClick: target => runLifecycle(restoreRole, target),
          },
        ]
      : [
          {
            label: 'Edit',
            icon: <EditIcon fontSize="small" />,
            // M0003-R019: Edit opens the detail, the role's only editor.
            onClick: target => setSelected(target),
          },
          {
            label: 'Archive',
            icon: <ArchiveIcon fontSize="small" />,
            destructive: true,
            confirmTitle: 'Archive role?',
            confirmDescription: ARCHIVE_TEXT,
            onClick: target => runLifecycle(archiveRole, target),
          },
        ];
  }

  usePageHeader({
    title: 'Roles',
    search: tenant
      ? {
          value: search,
          onChange: setSearch,
          placeholder: 'Search by name',
          label: 'Search by name',
        }
      : null,
    tabs: tenant ? (
      <ArchiveViewTabs archived={archived} onChange={setArchived} />
    ) : null,
    actions: tenant
      ? [
          ...bulk.actions,
          canWrite &&
            !archived && {
              label: 'New role',
              create: true,
              onClick: () => setCreating(true),
            },
        ]
      : null,
  });

  if (!tenant)
    return <Alert severity="info">Select a tenant to manage its roles.</Alert>;

  return (
    <Stack spacing={3}>
      {actionError ? (
        <Alert severity="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}
      <StandardDataGrid
        columns={columnsFor(setSelected)}
        fetchPage={fetchPage}
        resetKey={resetKey}
        rowActions={rowActions}
        onSelectionChange={bulk.onSelectionChange}
        selectable={canWrite}
        ariaLabel="Roles"
        emptyMessage="No roles match."
        describeError={describeRoleError}
      />
      {bulk.dialogs}
      {selected && !creating ? (
        <RoleDetailDialog
          role={selected}
          canWrite={canWrite}
          tenantCode={tenant.code}
          onClose={() => setSelected(null)}
          onSaved={saved => {
            setSelected(saved);
            reload();
          }}
          onStale={async () => {
            try {
              setSelected(await getRole(selected.id));
            } catch {
              // Keep the stale view; the list reload below still refreshes.
            }
            reload();
          }}
          onError={onError}
          onArchive={() => setConfirmArchive(true)}
          onRestore={() => runLifecycle(restoreRole, selected)}
        />
      ) : null}
      <ConfirmDialog
        open={confirmArchive}
        title="Archive role?"
        description={ARCHIVE_TEXT}
        confirmLabel="Archive"
        onConfirm={() => {
          setConfirmArchive(false);
          runLifecycle(archiveRole, selected);
        }}
        onCancel={() => setConfirmArchive(false)}
      />
      {creating ? (
        <RoleFormDialog
          onClose={() => setCreating(false)}
          onSaved={saved => {
            setCreating(false);
            notify(`${saved.name} created.`);
            // M0003-R020: the new role opens, to set its grants.
            setSelected(saved);
            reload();
          }}
        />
      ) : null}
    </Stack>
  );
}
