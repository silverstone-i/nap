/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
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
    path: '/',
    ErrorBoundary: RouteError,
    HydrateFallback: RouteLoading,
    lazy: async () => {
      const { HoldingPage } = await import('./pages/HoldingPage.js');
      return { Component: HoldingPage };
    },
  },
  {
    Component: SessionProvider,
    ErrorBoundary: RouteError,
    children: [
      {
        path: '/login',
        HydrateFallback: RouteLoading,
        lazy: async () => ({
          Component: (await import('./pages/LoginPage.js')).LoginPage,
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
