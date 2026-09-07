/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { RouterProvider, type RouterProviderProps } from 'react-router';
import { ThemeModeProvider } from './theme/ThemeModeProvider.js';

/**
 * Does: Composes the browser routes within the shared display-theme provider.
 * Called by: main.tsx with the router created once at application startup.
 */
export function App({ router }: Pick<RouterProviderProps, 'router'>) {
  return (
    <ThemeModeProvider>
      <RouterProvider router={router} />
    </ThemeModeProvider>
  );
}
