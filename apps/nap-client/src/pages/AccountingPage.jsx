import React from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Box, Typography, Button } from '@mui/material';

const columns = [
  { field: 'id', headerName: 'ID', width: 90 },
  { field: 'date', headerName: 'Date', width: 130 },
  { field: 'description', headerName: 'Description', flex: 1 },
  { field: 'debit', headerName: 'Debit Account', width: 150 },
  { field: 'credit', headerName: 'Credit Account', width: 150 },
  { field: 'amount', headerName: 'Amount', width: 100 },
  { field: 'status', headerName: 'Status', width: 100 }
];

const rows = [
  { id: 1, date: '2025-01-15', description: 'Bill posting', debit: 'Materials', credit: 'Accounts Payable', amount: '$10,000', status: 'Posted' }
];

export default function AccountingPage() {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h4">Accounting & General Ledger</Typography>
        <Button variant="contained">New Journal Entry</Button>
      </Box>
      <div style={{ height: 400, width: '100%' }}>
        <DataGrid rows={rows} columns={columns} pageSize={5} rowsPerPageOptions={[5]} />
      </div>
    </Box>
  );
}