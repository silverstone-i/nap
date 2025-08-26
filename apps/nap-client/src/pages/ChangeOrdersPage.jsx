import React from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Box, Typography, Button } from '@mui/material';

const columns = [
  { field: 'id', headerName: 'ID', width: 90 },
  { field: 'reference', headerName: 'Reference', width: 130 },
  { field: 'project', headerName: 'Project/Unit', flex: 1 },
  { field: 'activity', headerName: 'Activity', width: 150 },
  { field: 'amount', headerName: 'Change Amount', width: 150 },
  { field: 'status', headerName: 'Status', width: 120 }
];

const rows = [
  { id: 1, reference: 'CO-001', project: 'Project A / Unit 1', activity: 'Framing', amount: '$5,000', status: 'Draft' }
];

export default function ChangeOrdersPage() {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h4">Change Orders</Typography>
        <Button variant="contained">New Change Order</Button>
      </Box>
      <div style={{ height: 400, width: '100%' }}>
        <DataGrid rows={rows} columns={columns} pageSize={5} rowsPerPageOptions={[5]} />
      </div>
    </Box>
  );
}