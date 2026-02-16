/**
 * @file Navigation configuration — sidebar groups and items per PRD §7
 * @module nap-client/config/navigationConfig
 *
 * Each nav group has a label, icon, and array of children.
 * Each child has a label, path, and optional capability guard.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import DashboardIcon from '@mui/icons-material/Dashboard';
import ConstructionIcon from '@mui/icons-material/Construction';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AssessmentIcon from '@mui/icons-material/Assessment';
import ApartmentIcon from '@mui/icons-material/Apartment';

export const NAV_ITEMS = [
  {
    label: 'Dashboard',
    icon: DashboardIcon,
    children: [
      { label: 'Overview', path: '/dashboard' },
      { label: 'Company Cashflow', path: '/dashboard/cashflow' },
    ],
  },
  {
    label: 'Projects',
    icon: ConstructionIcon,
    children: [
      { label: 'Project List', path: '/projects' },
      { label: 'Project Detail', path: '/projects/detail', capability: 'projects::' },
      { label: 'Project Profitability', path: '/projects/profitability', capability: 'projects::' },
    ],
  },
  {
    label: 'Budgets',
    icon: AccountBalanceWalletIcon,
    children: [
      { label: 'Budget Management', path: '/budgets', capability: 'budgets::' },
    ],
  },
  {
    label: 'Actual Costs',
    icon: ReceiptLongIcon,
    children: [
      { label: 'Cost Tracking', path: '/actual-costs', capability: 'actual-costs::' },
    ],
  },
  {
    label: 'Change Orders',
    icon: SwapHorizIcon,
    children: [
      { label: 'Change Order Management', path: '/change-orders', capability: 'change-orders::' },
    ],
  },
  {
    label: 'AP',
    icon: ShoppingCartIcon,
    children: [
      { label: 'Vendors', path: '/ap/vendors', capability: 'ap::' },
      { label: 'AP Invoices', path: '/ap/invoices', capability: 'ap::' },
      { label: 'Payments', path: '/ap/payments', capability: 'ap::' },
      { label: 'Credit Memos', path: '/ap/credit-memos', capability: 'ap::' },
      { label: 'AP Aging', path: '/ap/aging', capability: 'ap::' },
    ],
  },
  {
    label: 'AR',
    icon: PointOfSaleIcon,
    children: [
      { label: 'Clients', path: '/ar/clients', capability: 'ar::' },
      { label: 'AR Invoices', path: '/ar/invoices', capability: 'ar::' },
      { label: 'Receipts', path: '/ar/receipts', capability: 'ar::' },
      { label: 'AR Aging', path: '/ar/aging', capability: 'ar::' },
    ],
  },
  {
    label: 'Accounting & GL',
    icon: AccountBalanceIcon,
    children: [
      { label: 'Chart of Accounts', path: '/accounting/chart-of-accounts', capability: 'accounting::' },
      { label: 'Journal Entries', path: '/accounting/journal-entries', capability: 'accounting::' },
      { label: 'Ledger', path: '/accounting/ledger', capability: 'accounting::' },
      { label: 'Intercompany', path: '/accounting/intercompany', capability: 'accounting::' },
    ],
  },
  {
    label: 'Reports',
    icon: AssessmentIcon,
    children: [
      { label: 'Budget vs Actual', path: '/reports/budget-vs-actual', capability: 'reports::' },
      { label: 'Profitability', path: '/reports/profitability', capability: 'reports::' },
      { label: 'Cashflow', path: '/reports/cashflow', capability: 'reports::' },
      { label: 'Margin Analysis', path: '/reports/margin-analysis', capability: 'reports::' },
      { label: 'P&L', path: '/reports/pnl', capability: 'reports::' },
      { label: 'Balance Sheet', path: '/reports/balance-sheet', capability: 'reports::' },
    ],
  },
  {
    label: 'Tenants',
    icon: ApartmentIcon,
    children: [
      { label: 'Manage Tenants', path: '/tenant/manage-tenants', capability: 'tenants::' },
      { label: 'Manage Users', path: '/tenant/manage-users', capability: 'tenants::' },
      { label: 'Settings', path: '/tenant/settings' },
    ],
  },
];

export default NAV_ITEMS;
