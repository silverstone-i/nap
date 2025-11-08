import React, { useMemo, useCallback } from 'react';
import { Box } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EditIcon from '@mui/icons-material/Edit';
import ArchiveIcon from '@mui/icons-material/Archive';
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash';
import ResourceGrid, {
  RESOURCE_SELECTION_MODES
} from '../../components/resource/ResourceGrid.jsx';

const tenantColumns = [
  { field: 'code', headerName: 'Code', width: 120 },
  { field: 'name', headerName: 'Tenant Name', flex: 1, minWidth: 220 },
  { field: 'status', headerName: 'Status', width: 150 },
  { field: 'tier', headerName: 'Tier', width: 130 },
  { field: 'region', headerName: 'Region', width: 140 },
  { field: 'activeProjects', headerName: 'Active Projects', type: 'number', width: 160 },
  { field: 'createdAt', headerName: 'Created', width: 170 }
];

const tenantRows = [
  {
    id: 'nap-prop',
    code: 'NAP-001',
    name: 'Nap Properties',
    status: 'Active',
    tier: 'Enterprise',
    region: 'West',
    activeProjects: 12,
    createdAt: '2021-11-03'
  },
  {
    id: 'calco',
    code: 'CAL-004',
    name: 'Calco Partners',
    status: 'Trial',
    tier: 'Growth',
    region: 'West',
    activeProjects: 4,
    createdAt: '2023-04-19'
  },
  {
    id: 'sierra',
    code: 'SIE-002',
    name: 'Sierra Construction',
    status: 'Active',
    tier: 'Growth',
    region: 'Mountain',
    activeProjects: 7,
    createdAt: '2022-07-08'
  },
  {
    id: 'evergreen',
    code: 'EVR-006',
    name: 'Evergreen Ventures',
    status: 'Suspended',
    tier: 'Starter',
    region: 'Northwest',
    activeProjects: 1,
    createdAt: '2020-02-14'
  },
  {
    id: 'brighton',
    code: 'BRI-012',
    name: 'Brighton Living',
    status: 'Pending',
    tier: 'Starter',
    region: 'Northeast',
    activeProjects: 0,
    createdAt: '2024-02-01'
  }
];

export default function ManageTenantsPage() {
  const handleTenantAction = useCallback(
    (actionId) => (event, context) => {
      console.log(`Tenant action: ${actionId}`, { event, context });
    },
    []
  );

  const tenantToolbarActions = useMemo(
    () => [
      { id: 'create', label: 'Create Tenant', icon: <AddIcon />, onClick: handleTenantAction('create') },
      {
        id: 'view',
        label: 'View Details',
        icon: <VisibilityIcon />,
        requireSelection: true,
        minSelected: 1,
        maxSelected: 1,
        onClick: handleTenantAction('view')
      },
      {
        id: 'edit',
        label: 'Edit Tenant',
        icon: <EditIcon />,
        requireSelection: true,
        minSelected: 1,
        maxSelected: 1,
        onClick: handleTenantAction('edit')
      },
      {
        id: 'archive',
        label: 'Archive',
        icon: <ArchiveIcon />,
        requireSelection: true,
        minSelected: 1,
        onClick: handleTenantAction('archive')
      },
      {
        id: 'restore',
        label: 'Restore',
        icon: <RestoreFromTrashIcon />,
        requireSelection: true,
        minSelected: 1,
        onClick: handleTenantAction('restore')
      }
    ],
    [handleTenantAction]
  );

  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <ResourceGrid
        title="Manage Tenants"
        columns={tenantColumns}
        rows={tenantRows}
        toolbarActions={tenantToolbarActions}
        selectionMode={RESOURCE_SELECTION_MODES.MULTIPLE}
        pagination={{ initialPageSize: 10, pageSizeOptions: [5, 10, 25, 50] }}
      />
    </Box>
  );
}
