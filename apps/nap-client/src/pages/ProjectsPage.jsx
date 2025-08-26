import React from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Box, Typography, Button } from '@mui/material';

// Placeholder data and columns for the projects table.  Replace
// these with real data fetched from the backend.  Additional columns
// such as Status, Total budget and Margin can be added as needed.
const columns = [
  { field: 'id', headerName: 'ID', width: 90 },
  { field: 'name', headerName: 'Project Name', flex: 1 },
  { field: 'client', headerName: 'Client', flex: 1 },
  { field: 'status', headerName: 'Status', width: 130 },
  { field: 'budget', headerName: 'Total Budget', width: 150 }
];

const rows = [
  { id: 1, name: 'Project Alpha', client: 'Client A', status: 'In Progress', budget: '$500,000' },
  { id: 2, name: 'Project Beta', client: 'Client B', status: 'Completed', budget: '$750,000' }
];

export default function ProjectsPage() {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h4">Projects</Typography>
        <Button variant="contained">Add Project</Button>
      </Box>
      <div style={{ height: 400, width: '100%' }}>
        <DataGrid rows={rows} columns={columns} pageSize={5} rowsPerPageOptions={[5]} />
      </div>
    </Box>
  );
}