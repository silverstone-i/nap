/**
 * @file Project cashflow report — project selector + line chart + monthly grid
 * @module nap-client/pages/Reports/ProjectCashflowPage
 *
 * Implements PRD §3.10.6 — per-project cashflow analysis.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';
import { LineChart } from '@mui/x-charts/LineChart';

import CurrencyCell from '../../components/shared/CurrencyCell.jsx';
import { useProjects } from '../../hooks/useProjects.js';
import { useProjectCashflow } from '../../hooks/useReports.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

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
  { field: 'cumulative_net', headerName: 'Cumulative', width: 140, renderCell: (params) => <CurrencyCell value={params.value} variance /> },
];

export default function ProjectCashflowPage() {
  const { data: projRes } = useProjects({ limit: 500 });
  const projects = projRes?.rows ?? [];

  const [projectId, setProjectId] = useState('');
  const { data: rows = [], isLoading } = useProjectCashflow(projectId);

  const chartLabels = useMemo(
    () => rows.map((r) => r.month ? new Date(r.month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) : ''),
    [rows],
  );
  const inflowData = useMemo(() => rows.map((r) => Number(r.inflow || 0)), [rows]);
  const outflowData = useMemo(() => rows.map((r) => Number(r.outflow || 0)), [rows]);
  const netData = useMemo(() => rows.map((r) => Number(r.cumulative_net || 0)), [rows]);

  return (
    <Box sx={pageContainerSx}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Project Cashflow</Typography>
        <TextField
          select
          label="Select Project"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          sx={{ minWidth: 300, mb: 2 }}
          size="small"
        >
          <MenuItem value="">— Select —</MenuItem>
          {projects.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.project_code} — {p.project_name || p.name}
            </MenuItem>
          ))}
        </TextField>

        {rows.length > 0 && (
          <Box sx={{ height: 300, mb: 3 }}>
            <LineChart
              xAxis={[{ data: chartLabels, scaleType: 'band' }]}
              series={[
                { data: inflowData, label: 'Inflow', color: '#4caf50' },
                { data: outflowData, label: 'Outflow', color: '#f44336' },
                { data: netData, label: 'Cumulative Net', color: '#2196f3' },
              ]}
              height={280}
            />
          </Box>
        )}
      </Box>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.month || Math.random()}
        loading={isLoading}
        pageSizeOptions={[25, 50]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        disableRowSelectionOnClick
      />
    </Box>
  );
}
