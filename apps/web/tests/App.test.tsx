/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/// <reference lib="es2024.promise" />

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createMemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router';
import { App } from '../src/App.js';
import { routes } from '../src/routes.js';
import { ThemeModeProvider } from '../src/theme/ThemeModeProvider.js';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
  window.history.replaceState({}, '', '/');
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            version: 1,
            code: 'UNAUTHENTICATED',
            message: 'Authentication required',
          }),
          { status: 401 }
        )
      )
    )
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * Does: Mounts production route definitions with an isolated browser history.
 * Called by: Route tests, with modified page behavior only for failure injection.
 */
function mount(routeDefinitions: RouteObject[] = routes, path = '/') {
  const router = createMemoryRouter(routeDefinitions, {
    initialEntries: [path],
  });
  render(
    <ThemeModeProvider>
      <RouterProvider router={router} />
    </ThemeModeProvider>
  );
  return router;
}

it('renders the actual app with accessible entry content and theme control', async () => {
  render(<App router={createMemoryRouter(routes)} />);
  expect(
    await screen.findByRole('heading', {
      level: 1,
      name: 'Sign in',
    })
  ).toBeDefined();
  expect(screen.getByRole('main')).toBeDefined();
  expect(screen.getByRole('img', { name: 'nap.' })).toBeDefined();
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDefined();
  expect(screen.getByRole('combobox', { name: 'Theme' })).toBeDefined();
  expect(screen.queryByRole('navigation')).toBeNull();
});

it('renders an unknown page with a real home link', () => {
  mount(routes, '/not-implemented');
  expect(screen.getByRole('heading', { name: 'Page not found' })).toBeDefined();
  expect(
    screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')
  ).toBe('/');
});

it('announces loading while a route import is pending', async () => {
  const pending = Promise.withResolvers<{
    Component: () => React.JSX.Element;
  }>();
  mount([
    {
      ...routes[0],
      path: '/',
      children: undefined,
      Component: undefined,
      lazy: () => pending.promise,
    },
  ]);
  expect(screen.getByRole('status').textContent).toBe('Loading…');
  pending.resolve({ Component: () => <h1>Loaded page</h1> });
  expect(
    await screen.findByRole('heading', { name: 'Loaded page' })
  ).toBeDefined();
  expect(screen.queryByRole('status')).toBeNull();
});

it.each(['import', 'render'])(
  'recovers from a page %s failure without revealing the exception',
  async failure => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    /** Does: Throws a private error to exercise the production route boundary. */
    function BrokenPage(): React.JSX.Element {
      throw new Error('private-internal-detail');
    }
    const route: RouteObject =
      failure === 'import'
        ? {
            ...routes[0],
            path: '/',
            children: undefined,
            Component: undefined,
            lazy: () => Promise.reject(new Error('private-internal-detail')),
          }
        : {
            ...routes[0],
            path: '/',
            children: undefined,
            lazy: undefined,
            Component: BrokenPage,
          };
    mount([route]);
    expect(
      await screen.findByRole('heading', {
        name: 'We couldn’t load this page.',
      })
    ).toBeDefined();
    expect(screen.queryByText(/private-internal-detail/)).toBeNull();
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(reload).toHaveBeenCalledOnce();
  }
);
