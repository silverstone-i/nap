/**
 * @file Budget vs Actual cost breakdown — project selector + bar chart + grid
 * @module nap-client/pages/Reports/CostBreakdownPage
 *
 * Implements PRD §3.10.6 — per-project cost breakdown by category.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';
import { BarChart } from '@mui/x-charts/BarChart';

import CurrencyCell from '../../components/shared/CurrencyCell.jsx';
import { useProjects } from '../../hooks/useProjects.js';
import { useCostBreakdown } from '../../hooks/useReports.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const columns = [
  { field: 'category_code', headerName: 'Code', width: 100 },
  { field: 'category_name', headerName: 'Category', flex: 1, minWidth: 180 },
  { field: 'budgeted_amount', headerName: 'Budgeted', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'actual_amount', headerName: 'Actual', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'variance', headerName: 'Variance', width: 140, renderCell: (params) => <CurrencyCell value={params.value} variance /> },
];

export default function CostBreakdownPage() {
  const { data: projRes } = useProjects({ limit: 500 });
  const projects = projRes?.rows ?? [];

  const [projectId, setProjectId] = useState('');
  const { data: rows = [], isLoading } = useCostBreakdown(projectId);

  const chartLabels = useMemo(() => rows.map((r) => r.category_code || r.category_name || ''), [rows]);
  const budgetData = useMemo(() => rows.map((r) => Number(r.budgeted_amount || 0)), [rows]);
  const actualData = useMemo(() => rows.map((r) => Number(r.actual_amount || 0)), [rows]);

  return (
    <Box sx={pageContainerSx}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Budget vs Actual</Typography>
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
            <BarChart
              xAxis={[{ data: chartLabels, scaleType: 'band' }]}
              series={[
                { data: budgetData, label: 'Budgeted', color: '#2196f3' },
                { data: actualData, label: 'Actual', color: '#ff9800' },
              ]}
              height={280}
            />
          </Box>
        )}
      </Box>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.category_code || Math.random()}
        loading={isLoading}
        pageSizeOptions={[25, 50]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        disableRowSelectionOnClick
      />
    </Box>
  );
}
