import React, { useMemo, useCallback } from 'react';
import { Box } from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import EmailIcon from '@mui/icons-material/Email';
import SecurityIcon from '@mui/icons-material/Security';
import PauseCircleIcon from '@mui/icons-material/PauseCircle';
import DeleteIcon from '@mui/icons-material/Delete';
import ResourceGrid, {
  RESOURCE_SELECTION_MODES
} from '../../components/resource/ResourceGrid.jsx';

const userColumns = [
  { field: 'name', headerName: 'User', flex: 1, minWidth: 220 },
  { field: 'tenant', headerName: 'Tenant', flex: 1, minWidth: 200 },
  { field: 'email', headerName: 'Email', flex: 1.2, minWidth: 240 },
  { field: 'role', headerName: 'Role', width: 140 },
  { field: 'status', headerName: 'Status', width: 150 },
  { field: 'lastActive', headerName: 'Last Active', width: 170 }
];

const userRows = [
  {
    id: 'a-gilmore',
    name: 'Ava Gilmore',
    tenant: 'Nap Properties',
    email: 'ava.gilmore@napsoft.com',
    role: 'Tenant Admin',
    status: 'Active',
    lastActive: 'Mar 02, 2024'
  },
  {
    id: 'm-turner',
    name: 'Miles Turner',
    tenant: 'Calco Partners',
    email: 'miles.turner@calco.dev',
    role: 'Project Manager',
    status: 'Invited',
    lastActive: '—'
  },
  {
    id: 'l-franco',
    name: 'Luna Franco',
    tenant: 'Sierra Construction',
    email: 'luna.franco@sierra.build',
    role: 'Controller',
    status: 'Active',
    lastActive: 'Feb 22, 2024'
  },
  {
    id: 'p-miles',
    name: 'Preston Miles',
    tenant: 'Evergreen Ventures',
    email: 'preston.miles@evergreen.vc',
    role: 'Viewer',
    status: 'Suspended',
    lastActive: 'Jan 17, 2024'
  },
  {
    id: 'z-hayes',
    name: 'Zara Hayes',
    tenant: 'Brighton Living',
    email: 'zara.hayes@brighton.live',
    role: 'Tenant Admin',
    status: 'Pending',
    lastActive: '—'
  }
];

export default function ManageUsersPage() {
  const handleUserAction = useCallback(
    (actionId) => (event, context) => {
      console.log(`Tenant user action: ${actionId}`, { event, context });
    },
    []
  );

  const userToolbarActions = useMemo(
    () => [
      { id: 'invite', label: 'Invite User', icon: <PersonAddIcon />, onClick: handleUserAction('invite') },
      {
        id: 'resend',
        label: 'Resend Invite',
        icon: <EmailIcon />,
        requireSelection: true,
        minSelected: 1,
        onClick: handleUserAction('resend')
      },
      {
        id: 'reset-mfa',
        label: 'Reset MFA',
        icon: <SecurityIcon />,
        requireSelection: true,
        minSelected: 1,
        maxSelected: 3,
        onClick: handleUserAction('reset-mfa')
      },
      {
        id: 'suspend',
        label: 'Suspend',
        icon: <PauseCircleIcon />,
        requireSelection: true,
        minSelected: 1,
        onClick: handleUserAction('suspend')
      },
      {
        id: 'remove',
        label: 'Remove',
        icon: <DeleteIcon />,
        requireSelection: true,
        minSelected: 1,
        onClick: handleUserAction('remove')
      }
    ],
    [handleUserAction]
  );

  return (
    <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <ResourceGrid
        title="Manage Users"
        columns={userColumns}
        rows={userRows}
        toolbarActions={userToolbarActions}
        selectionMode={RESOURCE_SELECTION_MODES.MULTIPLE}
        pagination={{ initialPageSize: 10, pageSizeOptions: [5, 10, 25, 50] }}
      />
    </Box>
  );
}
