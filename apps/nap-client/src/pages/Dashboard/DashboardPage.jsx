/**
 * @file Dashboard overview page — KPI summary cards and top-5 projects grid
 * @module nap-client/pages/Dashboard/DashboardPage
 *
 * Implements PRD §3.11 — executive summary with AR outstanding,
 * AP outstanding, net cashflow, and active project count.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';

import SummaryCard from '../../components/shared/SummaryCard.jsx';
import CurrencyCell from '../../components/shared/CurrencyCell.jsx';
import PercentCell from '../../components/shared/PercentCell.jsx';
import { useProjectProfitability } from '../../hooks/useReports.js';
import { useArAging } from '../../hooks/useReports.js';
import { useApAging } from '../../hooks/useReports.js';
import { useCompanyCashflow } from '../../hooks/useReports.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const columns = [
  { field: 'project_code', headerName: 'Code', width: 120 },
  { field: 'project_name', headerName: 'Project', flex: 1, minWidth: 180 },
  {
    field: 'invoiced_revenue',
    headerName: 'Revenue',
    width: 140,
    renderCell: (params) => <CurrencyCell value={params.value} />,
  },
  {
    field: 'gross_profit',
    headerName: 'Gross Profit',
    width: 140,
    renderCell: (params) => <CurrencyCell value={params.value} variance />,
  },
  {
    field: 'gross_margin_pct',
    headerName: 'Margin %',
    width: 110,
    renderCell: (params) => <PercentCell value={params.value} />,
  },
];

export default function DashboardPage() {
  const { data: profitRows = [], isLoading: profitLoading } = useProjectProfitability();
  const { data: arRows = [] } = useArAging();
  const { data: apRows = [] } = useApAging();
  const { data: cfRows = [] } = useCompanyCashflow();

  const arOutstanding = useMemo(() => arRows.reduce((s, r) => s + Number(r.total_balance || 0), 0), [arRows]);
  const apOutstanding = useMemo(() => apRows.reduce((s, r) => s + Number(r.total_balance || 0), 0), [apRows]);
  const netCashflow = useMemo(() => cfRows.reduce((s, r) => s + Number(r.net_cashflow || 0), 0), [cfRows]);
  const activeProjects = useMemo(() => profitRows.length, [profitRows]);

  const top5 = useMemo(
    () => [...profitRows].sort((a, b) => Number(b.invoiced_revenue || 0) - Number(a.invoiced_revenue || 0)).slice(0, 5),
    [profitRows],
  );

  return (
    <Box sx={pageContainerSx}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Dashboard</Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <SummaryCard title="AR Outstanding" value={fmt.format(arOutstanding)} color="info.main" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <SummaryCard title="AP Outstanding" value={fmt.format(apOutstanding)} color="warning.main" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <SummaryCard
              title="Net Cashflow"
              value={fmt.format(netCashflow)}
              color={netCashflow >= 0 ? 'success.main' : 'error.main'}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <SummaryCard title="Active Projects" value={activeProjects} />
          </Grid>
        </Grid>

        <Typography variant="subtitle1" gutterBottom>Top 5 Projects by Revenue</Typography>
      </Box>
      <DataGrid
        rows={top5}
        columns={columns}
        getRowId={(r) => r.project_id || r.project_code}
        loading={profitLoading}
        autoHeight
        hideFooter
        disableRowSelectionOnClick
      />
    </Box>
  );
}
