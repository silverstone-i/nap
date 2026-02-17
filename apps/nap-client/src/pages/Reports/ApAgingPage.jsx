/**
 * @file AP Aging report — DataGrid with aging buckets per vendor
 * @module nap-client/pages/Reports/ApAgingPage
 *
 * Implements PRD §3.10.6 — AP aging analysis.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';

import CurrencyCell from '../../components/shared/CurrencyCell.jsx';
import { useApAging } from '../../hooks/useReports.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const columns = [
  { field: 'vendor_code', headerName: 'Code', width: 100 },
  { field: 'vendor_name', headerName: 'Vendor', flex: 1, minWidth: 180 },
  { field: 'invoice_count', headerName: 'Invoices', width: 100, type: 'number' },
  { field: 'total_balance', headerName: 'Total', width: 140, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'current_bucket', headerName: 'Current', width: 130, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'bucket_1_30', headerName: '1-30', width: 130, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'bucket_31_60', headerName: '31-60', width: 130, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'bucket_61_90', headerName: '61-90', width: 130, renderCell: (params) => <CurrencyCell value={params.value} /> },
  { field: 'bucket_over_90', headerName: '90+', width: 130, renderCell: (params) => <CurrencyCell value={params.value} /> },
];

export default function ApAgingPage() {
  const { data: rows = [], isLoading } = useApAging();

  return (
    <Box sx={pageContainerSx}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>AP Aging</Typography>
      </Box>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.vendor_id || r.vendor_code}
        loading={isLoading}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        disableRowSelectionOnClick
      />
    </Box>
  );
}
