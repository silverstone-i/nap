/**
 * @file Root application component — React Router v7 route definitions
 * @module nap-client/App
 *
 * Public routes: /login
 * Protected routes: wrapped in LayoutShell (redirects to /login if unauthenticated)
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LayoutShell from './components/layout/LayoutShell.jsx';
import LoginPage from './pages/Auth/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes — guarded by LayoutShell */}
        <Route element={<LayoutShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />

          {/* Default redirect */}
          <Route index element={<Navigate to="/dashboard" replace />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
