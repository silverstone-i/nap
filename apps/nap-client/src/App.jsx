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
import DashboardPage from './pages/Dashboard/DashboardPage.jsx';
import CompanyCashflowPage from './pages/Dashboard/CompanyCashflowPage.jsx';
import ManageTenantsPage from './pages/Tenant/ManageTenantsPage.jsx';
import ManageUsersPage from './pages/Tenant/ManageUsersPage.jsx';
import ManageRolesPage from './pages/Tenant/ManageRolesPage.jsx';
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
import ApInvoicesPage from './pages/AP/ApInvoicesPage.jsx';
import PaymentsPage from './pages/AP/PaymentsPage.jsx';
import CreditMemosPage from './pages/AP/CreditMemosPage.jsx';
import ArInvoicesPage from './pages/AR/ArInvoicesPage.jsx';
import ReceiptsPage from './pages/AR/ReceiptsPage.jsx';
import ChartOfAccountsPage from './pages/Accounting/ChartOfAccountsPage.jsx';
import JournalEntriesPage from './pages/Accounting/JournalEntriesPage.jsx';
import LedgerPage from './pages/Accounting/LedgerPage.jsx';
import ProjectProfitabilityPage from './pages/Reports/ProjectProfitabilityPage.jsx';
import ProjectCashflowPage from './pages/Reports/ProjectCashflowPage.jsx';
import CostBreakdownPage from './pages/Reports/CostBreakdownPage.jsx';
import ArAgingPage from './pages/Reports/ArAgingPage.jsx';
import ApAgingPage from './pages/Reports/ApAgingPage.jsx';
import MarginAnalysisPage from './pages/Reports/MarginAnalysisPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes — guarded by LayoutShell */}
        <Route element={<LayoutShell />}>
          {/* Dashboard */}
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dashboard/cashflow" element={<CompanyCashflowPage />} />

          {/* Tenant management */}
          <Route path="/tenant/manage-tenants" element={<ManageTenantsPage />} />
          <Route path="/tenant/manage-users" element={<ManageUsersPage />} />
          <Route path="/tenant/manage-roles" element={<ManageRolesPage />} />

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

          {/* AP routes */}
          <Route path="/ap/invoices" element={<ApInvoicesPage />} />
          <Route path="/ap/payments" element={<PaymentsPage />} />
          <Route path="/ap/credit-memos" element={<CreditMemosPage />} />
          <Route path="/ap/vendors" element={<Navigate to="/core/vendors" replace />} />
          <Route path="/ap/aging" element={<ApAgingPage />} />

          {/* AR routes */}
          <Route path="/ar/invoices" element={<ArInvoicesPage />} />
          <Route path="/ar/receipts" element={<ReceiptsPage />} />
          <Route path="/ar/clients" element={<Navigate to="/core/clients" replace />} />
          <Route path="/ar/aging" element={<ArAgingPage />} />

          {/* Accounting routes */}
          <Route path="/accounting/chart-of-accounts" element={<ChartOfAccountsPage />} />
          <Route path="/accounting/journal-entries" element={<JournalEntriesPage />} />
          <Route path="/accounting/ledger" element={<LedgerPage />} />

          {/* Report routes */}
          <Route path="/reports/profitability" element={<ProjectProfitabilityPage />} />
          <Route path="/reports/cashflow" element={<ProjectCashflowPage />} />
          <Route path="/reports/budget-vs-actual" element={<CostBreakdownPage />} />
          <Route path="/reports/margin-analysis" element={<MarginAnalysisPage />} />

          {/* Default redirect */}
          <Route index element={<Navigate to="/dashboard" replace />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
