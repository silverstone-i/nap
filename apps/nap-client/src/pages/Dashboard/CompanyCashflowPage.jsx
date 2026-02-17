/**
 * @file Company cashflow summary page — summary cards + bar chart + monthly grid
 * @module nap-client/pages/Dashboard/CompanyCashflowPage
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useMemo } from 'react';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';
import { BarChart } from '@mui/x-charts/BarChart';

import SummaryCard from '../../components/shared/SummaryCard.jsx';
import CurrencyCell from '../../components/shared/CurrencyCell.jsx';
import { useCompanyCashflow } from '../../hooks/useReports.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const currFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const columns = [
  {
    field: 'month',
    headerName: 'Month',
    width: 130,
    valueGetter: (params) => params.row.month ? new Date(params.row.month).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : '',
  },
  { field: 'inflow', headerName: 'Inflow', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'outflow', headerName: 'Outflow', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'net_cashflow', headerName: 'Net', width: 140, renderCell: (params) => <CurrencyCell value={params.value} variance /> },
];

export default function CompanyCashflowPage() {
  const { data: rows = [], isLoading } = useCompanyCashflow();

  const totalInflow = useMemo(() => rows.reduce((s, r) => s + Number(r.inflow || 0), 0), [rows]);
  const totalOutflow = useMemo(() => rows.reduce((s, r) => s + Number(r.outflow || 0), 0), [rows]);
  const totalNet = useMemo(() => totalInflow - totalOutflow, [totalInflow, totalOutflow]);

  const chartLabels = useMemo(
    () => rows.map((r) => r.month ? new Date(r.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : ''),
    [rows],
  );
  const inflowData = useMemo(() => rows.map((r) => Number(r.inflow || 0)), [rows]);
  const outflowData = useMemo(() => rows.map((r) => Number(r.outflow || 0)), [rows]);

  return (
    <Box sx={pageContainerSx}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Company Cashflow</Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={4}>
            <SummaryCard title="Total Inflow" value={currFmt.format(totalInflow)} color="success.main" />
          </Grid>
          <Grid item xs={12} sm={4}>
            <SummaryCard title="Total Outflow" value={currFmt.format(totalOutflow)} color="error.main" />
          </Grid>
          <Grid item xs={12} sm={4}>
            <SummaryCard
              title="Net Cashflow"
              value={currFmt.format(totalNet)}
              color={totalNet >= 0 ? 'success.main' : 'error.main'}
            />
          </Grid>
        </Grid>

        {rows.length > 0 && (
          <Box sx={{ height: 300, mb: 3 }}>
            <BarChart
              xAxis={[{ data: chartLabels, scaleType: 'band' }]}
              series={[
                { data: inflowData, label: 'Inflow', color: '#4caf50' },
                { data: outflowData, label: 'Outflow', color: '#f44336' },
              ]}
              height={280}
            />
          </Box>
        )}
      </Box>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.month}
        loading={isLoading}
        pageSizeOptions={[25, 50]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        disableRowSelectionOnClick
      />
    </Box>
  );
}
