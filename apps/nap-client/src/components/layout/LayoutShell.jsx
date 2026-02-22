/**
 * @file LayoutShell — auth guard layout per PRD §2.3
 * @module nap-client/components/layout/LayoutShell
 *
 * Guards authenticated routes (redirects to /login if no user).
 * Shows loading spinner while auth is hydrating.
 *
 * Phase 2: Minimal layout (auth guard + Outlet). Phase 3+ adds
 * Sidebar, TenantBar, ModuleBar, ImpersonationBanner.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Navigate, Outlet } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext.jsx';
import ChangePasswordDialog from '../shared/ChangePasswordDialog.jsx';

export default function LayoutShell() {
  const { user, loading, refreshUser } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Invited users see only the forced password dialog — no app chrome
  if (user.status === 'invited') {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          bgcolor: 'background.default',
        }}
      >
        <ChangePasswordDialog open forced onSuccess={refreshUser} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Phase 3+ will add: Sidebar, TenantBar, ModuleBar, ImpersonationBanner */}
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <Box
          component="main"
          sx={{
            flex: 1,
            overflow: 'auto',
            p: 2,
            bgcolor: 'background.default',
          }}
        >
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
