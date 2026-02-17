/**
 * @file Margin analysis report — sortable DataGrid with profitability metrics
 * @module nap-client/pages/Reports/MarginAnalysisPage
 *
 * Implements PRD §3.10.6 — margin analysis with server-side sort via API params.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';

import StatusBadge from '../../components/shared/StatusBadge.jsx';
import CurrencyCell from '../../components/shared/CurrencyCell.jsx';
import PercentCell from '../../components/shared/PercentCell.jsx';
import { useMarginAnalysis } from '../../hooks/useReports.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const SORT_FIELDS = new Set([
  'project_code', 'project_name', 'invoiced_revenue', 'committed_cost',
  'gross_profit', 'gross_margin_pct', 'net_cashflow', 'budget_variance',
]);

const columns = [
  { field: 'project_code', headerName: 'Code', width: 120 },
  { field: 'project_name', headerName: 'Project', flex: 1, minWidth: 180 },
  {
    field: 'status',
    headerName: 'Status',
    width: 120,
    sortable: false,
    renderCell: ({ value }) => value ? <StatusBadge status={value} /> : null,
  },
  { field: 'invoiced_revenue', headerName: 'Revenue', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'committed_cost', headerName: 'Committed Cost', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'gross_profit', headerName: 'Gross Profit', width: 140, renderCell: (params) => <CurrencyCell value={params.value} variance /> },
  { field: 'gross_margin_pct', headerName: 'Margin %', width: 110, renderCell: (params) => <PercentCell value={params.value} /> },
  { field: 'net_cashflow', headerName: 'Net Cashflow', width: 140, renderCell: (params) => <CurrencyCell value={params.value} variance /> },
  { field: 'budget_variance', headerName: 'Budget Var.', width: 140, renderCell: (params) => <CurrencyCell value={params.value} variance /> },
];

export default function MarginAnalysisPage() {
  const [sortModel, setSortModel] = useState([{ field: 'gross_margin_pct', sort: 'desc' }]);

  const sortBy = sortModel[0]?.field || 'gross_margin_pct';
  const sortDir = (sortModel[0]?.sort || 'desc').toUpperCase();
  const apiParams = SORT_FIELDS.has(sortBy) ? { sortBy, sortDir } : {};

  const { data: rows = [], isLoading } = useMarginAnalysis(apiParams);

  return (
    <Box sx={pageContainerSx}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Margin Analysis</Typography>
      </Box>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.project_id || r.project_code}
        loading={isLoading}
        sortingMode="server"
        sortModel={sortModel}
        onSortModelChange={setSortModel}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        disableRowSelectionOnClick
      />
    </Box>
  );
}
