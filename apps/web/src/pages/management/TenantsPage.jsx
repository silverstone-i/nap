/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useMemo, useState } from 'react';
import Button from '@mui/material/Button';
import { listTenantsPage } from '../../api/endpoints.js';
import { createCursorPageAdapter } from '../../grid/cursorPageAdapter.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { CreateTenantDialog } from './CreateTenantDialog.jsx';

const COLUMNS = [
  {
    field: 'code',
    headerName: 'Code',
    flex: 1,
    sortable: false,
    priority: 'essential',
  },
  {
    field: 'name',
    headerName: 'Name',
    flex: 2,
    sortable: false,
    priority: 'essential',
  },
  {
    field: 'tier',
    headerName: 'Tier',
    flex: 1,
    sortable: false,
    priority: 'essential',
  },
  {
    field: 'status',
    headerName: 'Status',
    flex: 1,
    sortable: false,
    priority: 'essential',
  },
  {
    field: 'cellId',
    headerName: 'Cell',
    flex: 1,
    sortable: false,
    priority: 'secondary',
  },
  {
    field: 'provisioned',
    headerName: 'Provisioned',
    flex: 1,
    sortable: false,
    priority: 'secondary',
    type: 'boolean',
  },
  {
    field: 'rbacReady',
    headerName: 'RBAC ready',
    flex: 1,
    sortable: false,
    priority: 'secondary',
    type: 'boolean',
  },
];

/**
 * `/management/tenants` (F0002-R001): browse central tenant records and
 * create one. No update, suspend, archive, or restore action — none exists
 * server-side.
 */
export function TenantsPage() {
  const fetchPage = useMemo(() => createCursorPageAdapter(listTenantsPage), []);
  const [resetKey, setResetKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);

  usePageHeader({
    title: 'Tenants',
    actions: (
      <Button
        variant="contained"
        size="small"
        onClick={() => setDialogOpen(true)}
      >
        Create tenant
      </Button>
    ),
  });

  return (
    <>
      <StandardDataGrid
        columns={COLUMNS}
        fetchPage={fetchPage}
        resetKey={resetKey}
        emptyMessage="No tenants yet."
      />
      {dialogOpen ? (
        <CreateTenantDialog
          onClose={() => setDialogOpen(false)}
          onCreated={() => {
            setDialogOpen(false);
            setResetKey(key => key + 1);
          }}
        />
      ) : null}
    </>
  );
}
