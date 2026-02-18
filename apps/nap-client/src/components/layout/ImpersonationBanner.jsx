/**
 * @file ImpersonationBanner — sticky warning banner during impersonation
 * @module nap-client/components/layout/ImpersonationBanner
 *
 * Displays an amber warning bar above TenantBar when the current user
 * is impersonating another user. Includes an "Exit Impersonation" button.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Box, Typography, Button } from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useAuth } from '../../contexts/AuthContext.jsx';

export default function ImpersonationBanner() {
  const { impersonation, user, endImpersonation } = useAuth();

  if (!impersonation?.active) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        px: 2,
        py: 0.5,
        bgcolor: 'warning.main',
        color: 'warning.contrastText',
      }}
    >
      <WarningAmberIcon fontSize="small" />
      <Typography variant="body2" fontWeight={600}>
        Impersonating: {user?.email || user?.user_name} ({user?.tenant_code?.toUpperCase()})
      </Typography>
      <Button
        size="small"
        variant="outlined"
        onClick={endImpersonation}
        sx={{ color: 'inherit', borderColor: 'inherit', textTransform: 'none', py: 0 }}
      >
        Exit Impersonation
      </Button>
    </Box>
  );
}
