/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../src/routes.js';
import { ThemeModeProvider } from '../src/theme/ThemeModeProvider.js';

const actor = '00000000-0000-4000-8000-000000000001';
const tenant = '00000000-0000-4000-8000-000000000002';
const firstCell = '00000000-0000-4000-8000-000000000003';
const secondCell = '00000000-0000-4000-8000-000000000004';
const fetchMock = vi.fn<typeof fetch>();

/** Does: Creates a successful checked HTTP fixture. Called by: Cells route mocks. */
function reply(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ version: 1, data }), {
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

/** Does: Normalizes a fetch target for URL-specific fixtures. */
function requestPath(url: string | URL | Request) {
  return typeof url === 'string'
    ? url
    : url instanceof URL
      ? url.href
      : url.url;
}

/** Does: Renders the production router at a Cells destination. */
function mount(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ThemeModeProvider>
      <RouterProvider router={router} />
    </ThemeModeProvider>
  );
  return router;
}

/**
 * Does: Supplies session permissions and cell records for browser tests.
 * Called by: Cells tests before rendering a route.
 */
function fixture(registry = true, overview = true) {
  fetchMock.mockImplementation(url => {
    const path = requestPath(url);
    if (path.endsWith('/overview'))
      return reply({
        cellEnvironment: 'DEV',
        cells: [
          {
            id: firstCell,
            database_name: 'nap_dev_cell_east',
            available: true,
            enabled: true,
            stage: 'enabled',
            status: 'completed',
            failure_code: null,
          },
          {
            id: secondCell,
            database_name: 'nap_dev_cell_west',
            available: true,
            stage: 'seeded',
            status: 'failed',
            failure_code: 'Readiness failed',
            enabled: false,
          },
        ],
        tenants: [],
        users: [],
        members: [],
        jobs: [],
        grants: [],
      });
    if (path.endsWith('/registry')) return reply({ jobId: null });
    return reply({
      actorId: actor,
      email: 'operator@nap.test',
      tenantId: tenant,
      tenantCode: 'TEST',
      tenantName: 'Test tenant',
      userType: 'employee',
      canChangeTenant: false,
      state: 'tenant-selected',
      platformPermissions: [
        ...(overview ? ['admin-tenancy::control::overview'] : []),
        ...(registry ? ['admin-tenancy::control::registry'] : []),
      ],
      controlledAccess: null,
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('displays UUID/database names and copies UUID without navigation', async () => {
  fixture();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
  mount('/management/cells');
  expect(await screen.findByText('nap_dev_cell_east')).not.toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: `Copy cell UUID ${firstCell}` })
  );
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(firstCell));
  expect(await screen.findByText('Copied')).not.toBeNull();
  expect(screen.queryByText('Cell code')).toBeNull();
});
it('registers only the suffix and previews the server environment database name', async () => {
  fixture();
  mount('/management/cells');
  fireEvent.click(await screen.findByRole('button', { name: 'Register cell' }));
  fireEvent.change(screen.getByLabelText('Cell name suffix'), {
    target: { value: '1' },
  });
  expect(screen.getByText('nap_dev_cell_1')).not.toBeNull();
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Register cell' }).at(-1)!
  );
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(
        ([url, options]) =>
          requestPath(url).endsWith('/registry') &&
          options?.body === JSON.stringify({ operation: 'cell', suffix: '1' })
      )
    ).toBe(true)
  );
});
it('gates mutations by registry permission', async () => {
  fixture(false);
  mount('/management/cells');
  await screen.findByText('nap_dev_cell_east');
  expect(screen.queryByRole('button', { name: 'Register cell' })).toBeNull();
});
it('offers retry for a failed cell and confirms disabling an enabled cell', async () => {
  fixture();
  mount('/management/cells');
  fireEvent.click(
    await screen.findByRole('button', { name: 'Actions for nap_dev_cell_west' })
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'Retry' }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(
        ([, o]) =>
          o?.body ===
          JSON.stringify({ operation: 'cell-retry', cell: secondCell })
      )
    ).toBe(true)
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Actions for nap_dev_cell_east' })
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'Disable' }));
  expect(
    screen.getByText(
      'Assigned tenants will lose access while this cell is disabled.'
    )
  ).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Disable' }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(
        ([, o]) =>
          o?.body ===
          JSON.stringify({ operation: 'cell-disable', cell: firstCell })
      )
    ).toBe(true)
  );
});
