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
import ManageTenantsPage from './pages/Tenant/ManageTenantsPage.jsx';
import ManageUsersPage from './pages/Tenant/ManageUsersPage.jsx';
import VendorsPage from './pages/Core/VendorsPage.jsx';
import ClientsPage from './pages/Core/ClientsPage.jsx';
import EmployeesPage from './pages/Core/EmployeesPage.jsx';
import ContactsPage from './pages/Core/ContactsPage.jsx';
import ProjectsPage from './pages/Projects/ProjectsPage.jsx';
import ProjectDetailPage from './pages/Projects/ProjectDetailPage.jsx';
import ChangeOrdersPage from './pages/Projects/ChangeOrdersPage.jsx';
import DeliverablesPage from './pages/Activities/DeliverablesPage.jsx';
import BudgetManagementPage from './pages/Activities/BudgetManagementPage.jsx';
import CostTrackingPage from './pages/Activities/CostTrackingPage.jsx';
import CatalogPage from './pages/BOM/CatalogPage.jsx';
import VendorSkuMatchingPage from './pages/BOM/VendorSkuMatchingPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes — guarded by LayoutShell */}
        <Route element={<LayoutShell />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tenant/manage-tenants" element={<ManageTenantsPage />} />
          <Route path="/tenant/manage-users" element={<ManageUsersPage />} />

          {/* Core entity routes */}
          <Route path="/core/vendors" element={<VendorsPage />} />
          <Route path="/core/clients" element={<ClientsPage />} />
          <Route path="/core/employees" element={<EmployeesPage />} />
          <Route path="/core/contacts" element={<ContactsPage />} />

          {/* Project routes */}
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/change-orders" element={<ChangeOrdersPage />} />

          {/* Activities & cost management routes */}
          <Route path="/deliverables" element={<DeliverablesPage />} />
          <Route path="/budgets" element={<BudgetManagementPage />} />
          <Route path="/actual-costs" element={<CostTrackingPage />} />

          {/* BOM routes */}
          <Route path="/bom/catalog" element={<CatalogPage />} />
          <Route path="/bom/vendor-matching" element={<VendorSkuMatchingPage />} />

          {/* Default redirect */}
          <Route index element={<Navigate to="/dashboard" replace />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
