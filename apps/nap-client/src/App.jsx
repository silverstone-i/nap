/**
 * @file Root application component
 * @module nap-client/App
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Box, Typography } from '@mui/material';

export default function App() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Typography variant="h1" color="primary">
        NAP
      </Typography>
    </Box>
  );
}
