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

/** Does: Installs the session and bounded overview used by Cells tests. */
function fixture(registry = true) {
  fetchMock.mockImplementation(url => {
    const path = requestPath(url);
    if (path.endsWith('/overview'))
      return reply({
        cells: [
          { id: firstCell, code: 'CELL-1', name: 'First cell', enabled: true },
          {
            id: secondCell,
            code: 'CELL-2',
            name: 'Second cell',
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
        'admin-tenancy::control::overview',
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

it('lists cells with URL filters and gates registry mutations', async () => {
  fixture(false);
  const router = mount('/management/cells');
  // Initial lazy route imports can exceed the default one-second wait on CI.
  await screen.findByRole('grid', { name: 'Cells' }, { timeout: 5000 });
  expect(
    screen.getByRole('link', { name: 'Cells' }).getAttribute('aria-current')
  ).toBe('page');
  expect(screen.queryByRole('link', { name: 'Register cell' })).toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: 'Search cells' }), {
    target: { value: 'Second' },
  });
  expect(router.state.location.search).toContain('q=Second');
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Actions for First cell' })
    ).toBeNull()
  );
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Status' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Disabled' }));
  expect(router.state.location.search).toContain('status=disabled');
  fireEvent.click(
    screen.getByRole('button', { name: 'Actions for Second cell' })
  );
  expect(screen.getByRole('menuitem', { name: 'View cell' })).toBeDefined();
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Tenant Management' }));
  expect(await screen.findByRole('menuitem', { name: 'Cells' })).toBeDefined();
});

it('includes Cells in mobile Tenant Management navigation', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
  fixture();
  mount('/management/cells');
  await screen.findByRole('grid', { name: 'Cells' });
  expect(
    screen.queryByRole('navigation', { name: 'Main navigation' })
  ).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));
  expect(await screen.findByRole('link', { name: 'Cells' })).toBeDefined();
});

it('retains a duplicate listed code and offers its edit route without submitting', async () => {
  fixture();
  const router = mount('/management/cells/new');
  fireEvent.change(
    await screen.findByLabelText('Cell code', { exact: false }),
    {
      target: { value: 'CELL-1' },
    }
  );
  fireEvent.change(screen.getByLabelText('Cell name', { exact: false }), {
    target: { value: 'Duplicate cell' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Cell code CELL-1 is already registered.');
  expect(router.state.location.pathname).toBe('/management/cells/new');
  expect(screen.getByDisplayValue('Duplicate cell')).toBeDefined();
  expect(
    screen.getByRole('link', { name: 'Edit cell' }).getAttribute('href')
  ).toBe(`/management/cells/${firstCell}`);
  expect(
    fetchMock.mock.calls.some(([url]) => requestPath(url).endsWith('/registry'))
  ).toBe(false);
});

it('clears an overview error after retry while preserving save feedback', async () => {
  fixture();
  const respond = fetchMock.getMockImplementation();
  if (!respond) throw new Error('Missing fetch fixture');
  let failOverview = true;
  fetchMock.mockImplementation((url, init) => {
    if (requestPath(url).endsWith('/overview') && failOverview) {
      failOverview = false;
      return Promise.reject(new Error('offline'));
    }
    return respond(url, init);
  });
  mount(`/management/cells/${firstCell}`);
  fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
  await screen.findByRole('button', { name: 'Save' });
  expect(screen.queryByRole('alert')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Cell saved.');
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        requestPath(url).endsWith('/overview')
      )
    ).toHaveLength(3)
  );
  expect(screen.getByText('Cell saved.')).toBeDefined();
});

it('clears a duplicate warning when the code is corrected and saves the new code', async () => {
  fixture();
  mount('/management/cells/new');
  const code = await screen.findByLabelText('Cell code', { exact: false });
  fireEvent.change(code, { target: { value: 'CELL-1' } });
  fireEvent.change(screen.getByLabelText('Cell name', { exact: false }), {
    target: { value: 'New cell' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Cell code CELL-1 is already registered.');
  fireEvent.change(code, { target: { value: 'CELL-3' } });
  expect(
    screen.queryByText('Cell code CELL-1 is already registered.')
  ).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByRole('grid', { name: 'Cells' });
  const saved = fetchMock.mock.calls.find(([url]) =>
    requestPath(url).endsWith('/registry')
  );
  expect(
    JSON.parse(typeof saved?.[1]?.body === 'string' ? saved[1].body : '')
  ).toEqual({
    operation: 'cell',
    code: 'CELL-3',
    name: 'New cell',
    enabled: true,
  });
});

it('confirms assigned tenant access loss before disabling a cell', async () => {
  fixture();
  mount(`/management/cells/${firstCell}`);
  const enabled = await screen.findByRole('switch', { name: 'Enabled' });
  fireEvent.click(enabled);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(
    screen.getByText(
      'Assigned tenants will lose access while this cell is disabled.'
    )
  ).toBeDefined();
  expect(
    fetchMock.mock.calls.some(([url]) => requestPath(url).endsWith('/registry'))
  ).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Disable cell' }));
  await screen.findByText('Cell saved.');
  const registryCall = fetchMock.mock.calls.find(([url]) =>
    requestPath(url).endsWith('/registry')
  );
  expect(
    JSON.parse(
      typeof registryCall?.[1]?.body === 'string' ? registryCall[1].body : ''
    )
  ).toEqual({
    operation: 'cell',
    code: 'CELL-1',
    name: 'First cell',
    enabled: false,
  });
});
