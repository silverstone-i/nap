import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage.jsx';
import ProjectsPage from './pages/ProjectsPage.jsx';
import BudgetsPage from './pages/BudgetsPage.jsx';
import ActualCostsPage from './pages/ActualCostsPage.jsx';
import ChangeOrdersPage from './pages/ChangeOrdersPage.jsx';
import VendorsPage from './pages/VendorsPage.jsx';
import AccountingPage from './pages/AccountingPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ManageTenantsPage from './pages/tenants/ManageTenantsPage.jsx';
import ManageUsersPage from './pages/tenants/ManageUsersPage.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { isNapsoftEmployee } from './utils/isNapsoftEmployee.js';

// A simple component that either renders its children when the user
// is authenticated or redirects to the login page.  The login route
// is passed along as state so the user can be redirected back
// after successful authentication.
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" replace />;
};

const NapsoftRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return isNapsoftEmployee(user) ? children : <Navigate to="/dashboard" replace />;
};

// The route configuration is defined as a function to avoid cyclic
// dependencies.  Each route points to a page component.  Nested
// routes are left empty for now but can be extended later when
// implementing detail pages (e.g., project detail, budgets, etc.).
export const routes = [
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Outlet />
      </ProtectedRoute>
    ),
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/projects', element: <ProjectsPage /> },
      { path: '/budgets', element: <BudgetsPage /> },
      { path: '/actual-costs', element: <ActualCostsPage /> },
      { path: '/change-orders', element: <ChangeOrdersPage /> },
      { path: '/vendors', element: <VendorsPage /> },
      { path: '/accounting', element: <AccountingPage /> },
      { path: '/reports', element: <ReportsPage /> },
      { path: '/tenants', element: <Navigate to="/tenants/manage" replace /> },
      {
        path: '/tenants/manage',
        element: (
          <NapsoftRoute>
            <ManageTenantsPage />
          </NapsoftRoute>
        )
      },
      {
        path: '/tenants/users',
        element: (
          <NapsoftRoute>
            <ManageUsersPage />
          </NapsoftRoute>
        )
      },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
];
