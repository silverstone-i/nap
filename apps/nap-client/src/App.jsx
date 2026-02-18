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

/* ── Tenant pages (existing) ──────────────────────────────────── */
import ManageTenantsPage from './pages/Tenant/ManageTenantsPage.jsx';
import ManageUsersPage from './pages/Tenant/ManageUsersPage.jsx';
import ManageRolesPage from './pages/Tenant/ManageRolesPage.jsx';
import ManageEmployeesPage from './pages/Tenant/ManageEmployeesPage.jsx';

/* ── Dashboard pages ──────────────────────────────────────────── */
import DashboardPage from './pages/Dashboard/DashboardPage.jsx';
import CompanyCashflowPage from './pages/Dashboard/CompanyCashflowPage.jsx';

/* ── Report pages ─────────────────────────────────────────────── */
import ProjectProfitabilityPage from './pages/Reports/ProjectProfitabilityPage.jsx';
import ProjectCashflowPage from './pages/Reports/ProjectCashflowPage.jsx';
import CostBreakdownPage from './pages/Reports/CostBreakdownPage.jsx';
import ArAgingPage from './pages/Reports/ArAgingPage.jsx';
import ApAgingPage from './pages/Reports/ApAgingPage.jsx';
import MarginAnalysisPage from './pages/Reports/MarginAnalysisPage.jsx';

/* ── Project pages ────────────────────────────────────────────── */
import ProjectsPage from './pages/Projects/ProjectsPage.jsx';
import ProjectDetailPage from './pages/Projects/ProjectDetailPage.jsx';
import ChangeOrdersPage from './pages/Projects/ChangeOrdersPage.jsx';

/* ── Activity pages ───────────────────────────────────────────── */
import BudgetsPage from './pages/Activities/BudgetsPage.jsx';
import ActualCostsPage from './pages/Activities/ActualCostsPage.jsx';

/* ── Core pages ───────────────────────────────────────────────── */
import VendorsPage from './pages/Core/VendorsPage.jsx';

/* ── AP pages ─────────────────────────────────────────────────── */
import ApInvoicesPage from './pages/AP/ApInvoicesPage.jsx';
import PaymentsPage from './pages/AP/PaymentsPage.jsx';
import CreditMemosPage from './pages/AP/CreditMemosPage.jsx';

/* ── AR pages ─────────────────────────────────────────────────── */
import ClientsPage from './pages/AR/ClientsPage.jsx';
import ArInvoicesPage from './pages/AR/ArInvoicesPage.jsx';
import ReceiptsPage from './pages/AR/ReceiptsPage.jsx';

/* ── Accounting pages ─────────────────────────────────────────── */
import ChartOfAccountsPage from './pages/Accounting/ChartOfAccountsPage.jsx';
import JournalEntriesPage from './pages/Accounting/JournalEntriesPage.jsx';
import LedgerPage from './pages/Accounting/LedgerPage.jsx';

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

          {/* Projects */}
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/detail" element={<ProjectDetailPage />} />
          <Route path="/projects/profitability" element={<ProjectProfitabilityPage />} />

          {/* Budgets */}
          <Route path="/budgets" element={<BudgetsPage />} />

          {/* Actual Costs */}
          <Route path="/actual-costs" element={<ActualCostsPage />} />

          {/* Change Orders */}
          <Route path="/change-orders" element={<ChangeOrdersPage />} />

          {/* AP */}
          <Route path="/ap/vendors" element={<VendorsPage />} />
          <Route path="/ap/invoices" element={<ApInvoicesPage />} />
          <Route path="/ap/payments" element={<PaymentsPage />} />
          <Route path="/ap/credit-memos" element={<CreditMemosPage />} />
          <Route path="/ap/aging" element={<ApAgingPage />} />

          {/* AR */}
          <Route path="/ar/clients" element={<ClientsPage />} />
          <Route path="/ar/invoices" element={<ArInvoicesPage />} />
          <Route path="/ar/receipts" element={<ReceiptsPage />} />
          <Route path="/ar/aging" element={<ArAgingPage />} />

          {/* Accounting & GL */}
          <Route path="/accounting/chart-of-accounts" element={<ChartOfAccountsPage />} />
          <Route path="/accounting/journal-entries" element={<JournalEntriesPage />} />
          <Route path="/accounting/ledger" element={<LedgerPage />} />
          <Route path="/accounting/intercompany" element={<PlaceholderPage title="Intercompany" />} />

          {/* Reports */}
          <Route path="/reports/budget-vs-actual" element={<CostBreakdownPage />} />
          <Route path="/reports/profitability" element={<ProjectProfitabilityPage />} />
          <Route path="/reports/cashflow" element={<ProjectCashflowPage />} />
          <Route path="/reports/margin-analysis" element={<MarginAnalysisPage />} />
          <Route path="/reports/pnl" element={<PlaceholderPage title="P&L Statement" />} />
          <Route path="/reports/balance-sheet" element={<PlaceholderPage title="Balance Sheet" />} />

          {/* Tenants */}
          <Route path="/tenant/manage-tenants" element={<ManageTenantsPage />} />
          <Route path="/tenant/manage-users" element={<ManageUsersPage />} />
          <Route path="/tenant/manage-roles" element={<ManageRolesPage />} />
          <Route path="/tenant/manage-employees" element={<ManageEmployeesPage />} />

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
