/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { ProductShell } from './shell/ProductShell.js';
import { SessionProvider } from './auth/SessionProvider.js';
import type { RouteObject } from 'react-router';
import { RouteError } from './components/RouteError.js';
import { RouteLoading } from './components/RouteLoading.js';
import { NotFoundPage } from './pages/NotFoundPage.js';

/**
 * Does: Describes the implemented entry route and its loading and failure views.
 * Used by: App's browser router and route integration tests.
 */
export const routes: RouteObject[] = [
  {
    Component: SessionProvider,
    ErrorBoundary: RouteError,
    HydrateFallback: RouteLoading,
    children: [
      {
        path: '/',
        lazy: async () => ({
          Component: (await import('./pages/EntryPage.js')).EntryPage,
        }),
      },
      {
        Component: ProductShell,
        ErrorBoundary: RouteError,
        children: [
          {
            path: '/app/:tenantId/dashboard',
            lazy: async () => ({
              Component: (await import('./pages/DashboardPage.js'))
                .DashboardPage,
            }),
          },
          {
            path: '/app/:tenantId/accounting/directories',
            lazy: async () => ({
              Component: (await import('./pages/EmployeesPage.js'))
                .EmployeesPage,
            }),
          },
          ...[
            '/management/tenants',
            '/management/tenants/new',
            '/management/tenants/:target',
            '/management/portal-users',
            '/management/portal-users/new',
          ].map(path => ({
            path,
            lazy: async () => ({
              Component: (await import('./pages/ManagementPage.js'))
                .ManagementPage,
            }),
          })),
          ...[
            '/management/cells',
            '/management/cells/new',
            '/management/cells/:target',
          ].map(path => ({
            path,
            lazy: async () => ({
              Component: (await import('./pages/CellsPage.js')).CellsPage,
            }),
          })),
        ],
      },
      {
        path: '/access',
        lazy: async () => ({
          Component: (await import('./pages/AccessPage.js')).AccessPage,
        }),
      },
      {
        path: '/platform-access',
        lazy: async () => ({
          Component: (await import('./pages/PlatformAccessPage.js'))
            .PlatformAccessPage,
        }),
      },
      {
        path: '/companies',
        lazy: async () => ({
          Component: (await import('./pages/ScopeRecordsPage.js'))
            .ScopeRecordsPage,
        }),
      },
      {
        path: '/projects',
        lazy: async () => ({
          Component: (await import('./pages/ProjectsPage.js')).ProjectsPage,
        }),
      },
      {
        path: '/tenants',
        HydrateFallback: RouteLoading,
        lazy: async () => ({
          Component: (await import('./pages/TenantsPage.js')).TenantsPage,
        }),
      },
      {
        path: '/control',
        HydrateFallback: RouteLoading,
        lazy: async () => ({
          Component: (await import('./pages/ControlPage.js')).ControlPage,
        }),
      },
      {
        path: '/login',
        HydrateFallback: RouteLoading,
        lazy: async () => ({
          Component: (await import('./pages/LoginPage.js')).LoginPage,
        }),
      },
      {
        path: '/account/password',
        HydrateFallback: RouteLoading,
        lazy: async () => ({
          Component: (await import('./pages/ChangePasswordPage.js'))
            .ChangePasswordPage,
        }),
      },
      {
        path: '/account',
        HydrateFallback: RouteLoading,
        lazy: async () => ({
          Component: (await import('./pages/AccountPage.js')).AccountPage,
        }),
      },
    ],
  },
  { path: '*', Component: NotFoundPage, ErrorBoundary: RouteError },
];
