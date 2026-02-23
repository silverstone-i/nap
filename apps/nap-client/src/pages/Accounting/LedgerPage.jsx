/**
 * @file Ledger Balances read-only page — DataGrid showing account balances
 * @module nap-client/pages/Accounting/LedgerPage
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';

import CurrencyCell from '../../components/shared/CurrencyCell.jsx';
import { useLedgerBalances } from '../../hooks/useAccounting.js';
import { pageContainerSx } from '../../config/layoutTokens.js';

const fmtDate = (v) => (v ? new Date(v).toLocaleDateString() : '\u2014');

const columns = [
  { field: 'account_id', headerName: 'Account', width: 140, valueGetter: (params) => params.row.account_id?.slice(0, 8) ?? '\u2014' },
  { field: 'as_of_date', headerName: 'As Of', width: 130, valueGetter: (params) => fmtDate(params.row.as_of_date) },
  { field: 'balance', headerName: 'Balance', width: 160, renderCell: (params) => <CurrencyCell value={params.value} /> },
];

export default function LedgerPage() {
  const { data: res, isLoading } = useLedgerBalances();
  const rows = res?.rows ?? (Array.isArray(res) ? res : []);

  return (
    <Box sx={pageContainerSx}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>Ledger Balances</Typography>
      </Box>
      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        loading={isLoading}
        pageSizeOptions={[25, 50, 100]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        disableRowSelectionOnClick
      />
    </Box>
  );
}
