import React from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Box, Typography, Button } from '@mui/material';

const columns = [
  { field: 'id', headerName: 'ID', width: 90 },
  { field: 'name', headerName: 'Vendor Name', flex: 1 },
  { field: 'contact', headerName: 'Contact', width: 200 },
  { field: 'categories', headerName: 'Categories', width: 200 }
];

const rows = [
  { id: 1, name: 'Vendor X', contact: 'John Doe', categories: 'Concrete, Steel' },
  { id: 2, name: 'Vendor Y', contact: 'Jane Smith', categories: 'Electrical' }
];

export default function VendorsPage() {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h4">Vendors & AP/AR</Typography>
        <Button variant="contained">Add Vendor</Button>
      </Box>
      <div style={{ height: 400, width: '100%' }}>
        <DataGrid rows={rows} columns={columns} pageSize={5} rowsPerPageOptions={[5]} />
      </div>
    </Box>
  );
}