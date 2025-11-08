import React from 'react';
import { Box } from '@mui/material';
import LoginPage from './pages/LoginPage.jsx';

export default function App() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <LoginPage />
    </Box>
  );
}
