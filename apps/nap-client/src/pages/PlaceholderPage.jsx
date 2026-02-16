/**
 * @file Placeholder page — renders the page title for unimplemented routes
 * @module nap-client/pages/PlaceholderPage
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Box, Typography } from '@mui/material';

export default function PlaceholderPage({ title }) {
  return (
    <Box sx={{ py: 2 }}>
      <Typography variant="h5" color="text.primary" fontWeight={600}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" mt={1}>
        This page is under construction.
      </Typography>
    </Box>
  );
}
