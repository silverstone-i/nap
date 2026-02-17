/**
 * @file Project profitability report — DataGrid with profit/margin metrics
 * @module nap-client/pages/Reports/ProjectProfitabilityPage
 *
 * Implements PRD §3.10.6 — profitability overview for all projects.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import CurrencyCell from '../../components/shared/CurrencyCell.jsx';
import PercentCell from '../../components/shared/PercentCell.jsx';
import { useProjectProfitability } from '../../hooks/useReports.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const columns = [
  { field: 'project_code', headerName: 'Code', width: 120 },
  { field: 'project_name', headerName: 'Project', flex: 1, minWidth: 180 },
  {
    field: 'status',
    headerName: 'Status',
    width: 120,
    renderCell: ({ value }) => value ? <StatusBadge status={value} /> : null,
  },
  { field: 'invoiced_revenue', headerName: 'Revenue', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'committed_cost', headerName: 'Committed Cost', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'gross_profit', headerName: 'Gross Profit', width: 140, renderCell: (params) => <CurrencyCell value={params.value} variance /> },
  { field: 'gross_margin_pct', headerName: 'Margin %', width: 110, renderCell: (params) => <PercentCell value={params.value} /> },
  { field: 'net_cashflow', headerName: 'Net Cashflow', width: 140, renderCell: (params) => <CurrencyCell value={params.value} variance /> },
  { field: 'budget_variance', headerName: 'Budget Var.', width: 140, renderCell: (params) => <CurrencyCell value={params.value} variance /> },
];

export default function ProjectProfitabilityPage() {
  const { data: rows = [], isLoading } = useProjectProfitability();

  return (
    <Box sx={pageContainerSx}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Project Profitability</Typography>
      </Box>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.project_id || r.project_code}
        loading={isLoading}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        disableRowSelectionOnClick
      />
    </Box>
  );
}
