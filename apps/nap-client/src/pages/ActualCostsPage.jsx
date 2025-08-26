import React from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Box, Typography, Button } from '@mui/material';

const columns = [
  { field: 'id', headerName: 'ID', width: 90 },
  { field: 'date', headerName: 'Date', width: 130 },
  { field: 'description', headerName: 'Description', flex: 1 },
  { field: 'vendor', headerName: 'Vendor', width: 150 },
  { field: 'category', headerName: 'Category', width: 130 },
  { field: 'amount', headerName: 'Amount', width: 100 },
  { field: 'status', headerName: 'Status', width: 130 }
];

const rows = [
  { id: 1, date: '2025-01-05', description: 'Concrete delivery', vendor: 'Vendor X', category: 'Materials', amount: '$10,000', status: 'Approved' },
  { id: 2, date: '2025-01-10', description: 'Labour wages', vendor: 'Vendor Y', category: 'Labour', amount: '$5,000', status: 'Pending' }
];

export default function ActualCostsPage() {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h4">Actual Costs</Typography>
        <Button variant="contained">New Cost</Button>
      </Box>
      <div style={{ height: 400, width: '100%' }}>
        <DataGrid rows={rows} columns={columns} pageSize={5} rowsPerPageOptions={[5]} />
      </div>
    </Box>
  );
}