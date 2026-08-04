/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useNavigate } from 'react-router';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';
import type { GridColDef } from '@mui/x-data-grid';
import { getProjects } from '../mocks/data';
import type { Project } from '../mocks/types';
import { useScope } from '../shell/useScope';
import { formatCurrency } from '../lib/format';
import { ProjectStatusChip } from '../lib/StatusChip';
import { fontMono } from '../theme/tokens';

const currencyCol = {
  type: 'number',
  width: 130,
  cellClassName: 'num-cell',
  valueFormatter: (value: number) => formatCurrency(value),
} as const;

const columns: GridColDef<Project>[] = [
  { field: 'code', headerName: 'Code', width: 100 },
  { field: 'name', headerName: 'Project', flex: 1, minWidth: 240 },
  {
    field: 'status',
    headerName: 'Status',
    width: 140,
    renderCell: params => <ProjectStatusChip status={params.row.status} />,
  },
  { field: 'manager', headerName: 'Manager', width: 160 },
  { field: 'budget', headerName: 'Budget', ...currencyCol },
  { field: 'committed', headerName: 'Committed', ...currencyCol },
  { field: 'actual', headerName: 'Actual', ...currencyCol },
];

export function ProjectsListPage() {
  const { entityId } = useScope();
  const navigate = useNavigate();
  const projects = getProjects(entityId);

  return (
    <Stack spacing={2}>
      <Typography variant="h6" component="h1">
        Projects
      </Typography>
      <DataGrid
        rows={projects}
        columns={columns}
        density="compact"
        autoHeight
        disableRowSelectionOnClick
        onRowClick={params =>
          void navigate(`/${entityId}/projects/${params.id}`)
        }
        sx={{
          bgcolor: 'background.paper',
          fontSize: 13,
          '& .num-cell': { fontFamily: fontMono },
          '& .MuiDataGrid-row': { cursor: 'pointer' },
        }}
      />
    </Stack>
  );
}
