/**
 * @file LayoutShell — main layout wrapper with auth guard per PRD §2.3
 * @module nap-client/components/layout/LayoutShell
 *
 * Guards authenticated routes (redirects to /login if no user).
 * Shows loading spinner while auth is hydrating.
 * Renders: Sidebar | TenantBar + ModuleBar + Outlet
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Navigate, Outlet } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import Sidebar from './Sidebar.jsx';
import TenantBar from './TenantBar.jsx';
import ModuleBar from './ModuleBar.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';

export default function LayoutShell() {
  const { user, loading } = useAuth();

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

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar — sticky left, full height */}
      <Sidebar />

      {/* Main content area — TenantBar + ModuleBar + Data Viewport */}
      <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <TenantBar />
        <ModuleBar />

        {/* Data Viewport */}
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
