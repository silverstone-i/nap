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
import PlaceholderPage from './pages/PlaceholderPage.jsx';
import ManageTenantsPage from './pages/Tenant/ManageTenantsPage.jsx';
import ManageUsersPage from './pages/Tenant/ManageUsersPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes — guarded by LayoutShell */}
        <Route element={<LayoutShell />}>
          {/* Dashboard */}
          <Route path="/dashboard" element={<PlaceholderPage title="Dashboard — Overview" />} />
          <Route path="/dashboard/cashflow" element={<PlaceholderPage title="Company Cashflow Summary" />} />

          {/* Projects */}
          <Route path="/projects" element={<PlaceholderPage title="Project List" />} />
          <Route path="/projects/detail" element={<PlaceholderPage title="Project Detail" />} />
          <Route path="/projects/profitability" element={<PlaceholderPage title="Project Profitability" />} />

          {/* Budgets */}
          <Route path="/budgets" element={<PlaceholderPage title="Budget Management" />} />

          {/* Actual Costs */}
          <Route path="/actual-costs" element={<PlaceholderPage title="Cost Tracking" />} />

          {/* Change Orders */}
          <Route path="/change-orders" element={<PlaceholderPage title="Change Order Management" />} />

          {/* AP */}
          <Route path="/ap/vendors" element={<PlaceholderPage title="Vendors" />} />
          <Route path="/ap/invoices" element={<PlaceholderPage title="AP Invoices" />} />
          <Route path="/ap/payments" element={<PlaceholderPage title="Payments" />} />
          <Route path="/ap/credit-memos" element={<PlaceholderPage title="Credit Memos" />} />
          <Route path="/ap/aging" element={<PlaceholderPage title="AP Aging" />} />

          {/* AR */}
          <Route path="/ar/clients" element={<PlaceholderPage title="Clients" />} />
          <Route path="/ar/invoices" element={<PlaceholderPage title="AR Invoices" />} />
          <Route path="/ar/receipts" element={<PlaceholderPage title="Receipts" />} />
          <Route path="/ar/aging" element={<PlaceholderPage title="AR Aging" />} />

          {/* Accounting & GL */}
          <Route path="/accounting/chart-of-accounts" element={<PlaceholderPage title="Chart of Accounts" />} />
          <Route path="/accounting/journal-entries" element={<PlaceholderPage title="Journal Entries" />} />
          <Route path="/accounting/ledger" element={<PlaceholderPage title="Ledger" />} />
          <Route path="/accounting/intercompany" element={<PlaceholderPage title="Intercompany" />} />

          {/* Reports */}
          <Route path="/reports/budget-vs-actual" element={<PlaceholderPage title="Budget vs Actual" />} />
          <Route path="/reports/profitability" element={<PlaceholderPage title="Profitability Report" />} />
          <Route path="/reports/cashflow" element={<PlaceholderPage title="Cashflow Report" />} />
          <Route path="/reports/margin-analysis" element={<PlaceholderPage title="Margin Analysis" />} />
          <Route path="/reports/pnl" element={<PlaceholderPage title="P&L Statement" />} />
          <Route path="/reports/balance-sheet" element={<PlaceholderPage title="Balance Sheet" />} />

          {/* Tenants */}
          <Route path="/tenant/manage-tenants" element={<ManageTenantsPage />} />
          <Route path="/tenant/manage-users" element={<ManageUsersPage />} />
          <Route path="/tenant/settings" element={<PlaceholderPage title="Tenant Settings" />} />

          {/* User account */}
          <Route path="/profile" element={<PlaceholderPage title="My Profile" />} />
          <Route path="/settings" element={<PlaceholderPage title="User Settings" />} />

          {/* Default redirect */}
          <Route index element={<Navigate to="/dashboard" replace />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
