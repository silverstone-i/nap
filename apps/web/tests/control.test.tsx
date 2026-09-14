/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../src/routes.js';
import { ThemeModeProvider } from '../src/theme/ThemeModeProvider.js';
import { platformPermissions } from '@nap/shared';

const id = '00000000-0000-4000-8000-000000000001';
const tenant = '00000000-0000-4000-8000-000000000002';
const membership = '00000000-0000-4000-8000-000000000003';
const base = {
  actorId: id,
  email: 'person@nap.test',
  tenantId: tenant,
  tenantCode: 'TEST',
  expiresAt: '2099-01-01T00:00:00.000Z',
  state: 'tenant-selected',
  platformPermissions: [] as string[],
  controlledAccess: null as {
    mode: string;
    operatorId: string;
    reason: string;
  } | null,
};
const fetchMock =
  vi.fn<(url: string, init?: { body?: string }) => Promise<Response>>();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
/** Does: Creates a validated-envelope HTTP mock. Called by: browser flow fixtures. */
function reply(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(
      status === 200
        ? { version: 1, data }
        : { version: 1, code: 'FORBIDDEN', message: 'Access denied' }
    ),
    { status, headers: { 'Content-Type': 'application/json' } }
  );
}
/** Does: Resolves a mock HTTP response. Called by: URL-specific fetch handlers. */
function respond(data: unknown, status = 200) {
  return Promise.resolve(reply(data, status));
}
/** Does: Renders production routes under the project theme. Called by: web acceptance tests. */
function mount(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ThemeModeProvider>
      <RouterProvider router={router} />
    </ThemeModeProvider>
  );
  return router;
}

it('forces password replacement before selection or administration', async () => {
  fetchMock.mockResolvedValue(
    reply({
      ...base,
      state: 'password-change-required',
      tenantId: null,
      tenantCode: null,
    })
  );
  const router = mount('/control');
  await screen.findByText('Change your temporary password before continuing.');
  expect(router.state.location.pathname).toBe('/account/password');
  expect(screen.queryByText('Administration')).toBeNull();
  expect(screen.queryByRole('link', { name: 'Cancel' })).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('lists memberships, switches the current session and clears the selection page', async () => {
  let selected = false;
  fetchMock.mockImplementation((url, init) => {
    if (String(url).endsWith('/memberships'))
      return respond([
        {
          id: membership,
          tenantId: tenant,
          tenantCode: 'TEST',
          company: 'Test company',
          userType: 'vendor',
        },
      ]);
    if (String(url).endsWith('/select')) {
      expect(JSON.parse(String(init?.body))).toEqual({ membership });
      selected = true;
      return respond(null);
    }
    return respond({
      ...base,
      state: selected ? 'tenant-selected' : 'tenant-selection-required',
      tenantId: selected ? tenant : null,
      tenantCode: selected ? 'TEST' : null,
    });
  });
  const router = mount('/tenants');
  fireEvent.click(
    await screen.findByRole('button', { name: 'Test company (TEST)' })
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(`/app/${tenant}/dashboard`)
  );
  await screen.findByRole('heading', { name: 'Dashboard' });
  expect(
    screen.queryByRole('button', { name: 'Test company (TEST)' })
  ).toBeNull();
});
it('shows selection failures and permits retry', async () => {
  fetchMock.mockImplementation(url =>
    String(url).endsWith('/memberships')
      ? respond([
          {
            id: membership,
            tenantId: tenant,
            tenantCode: 'TEST',
            company: 'Test company',
            userType: 'vendor',
          },
        ])
      : String(url).endsWith('/select')
        ? respond(null, 403)
        : respond(base)
  );
  mount('/tenants');
  fireEvent.click(
    await screen.findByRole('button', { name: 'Test company (TEST)' })
  );
  await screen.findByText('Access denied');
  expect(
    screen
      .getByRole('button', { name: 'Test company (TEST)' })
      .hasAttribute('disabled')
  ).toBe(false);
});
it('shows controlled access and exits through a fresh authoritative session', async () => {
  let active = true;
  fetchMock.mockImplementation(url => {
    if (String(url).endsWith('/end-access')) {
      active = false;
      return respond(null);
    }
    return respond({
      ...base,
      controlledAccess: active
        ? { mode: 'impersonation', operatorId: id, reason: 'Support case' }
        : null,
    });
  });
  mount('/account/password');
  await screen.findByText(/Controlled impersonation/);
  expect(screen.queryByRole('link', { name: 'Administration' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Exit access' }));
  await waitFor(() =>
    expect(screen.queryByText(/Controlled impersonation/)).toBeNull()
  );
  await screen.findByRole('heading', { name: 'Dashboard' });
});
it('limits support forms to explicit permissions', async () => {
  fetchMock.mockResolvedValue(
    reply({ ...base, platformPermissions: ['admin-tenancy::control::access'] })
  );
  mount('/control');
  await screen.findByRole('heading', { name: 'Access' });
  expect(screen.queryByText('Register tenant')).toBeNull();
  expect(screen.queryByText('Platform permissions')).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('directs cell registration to the Cells page', async () => {
  fetchMock.mockImplementation(url =>
    String(url).endsWith('/session')
      ? respond({ ...base, platformPermissions: [...platformPermissions] })
      : String(url).endsWith('/overview')
        ? respond({
            cellEnvironment: 'DEV',
            cells: [],
            tenants: [],
            users: [],
            members: [],
            jobs: [],
            grants: [],
          })
        : respond({ jobId: null })
  );
  const router = mount('/control');
  await screen.findByRole('heading', { name: 'Tenants' });
  expect(router.state.location.pathname).toBe('/management/tenants');
  fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));
  const link = await screen.findByRole('link', { name: 'Cells' });
  expect(link.getAttribute('href')).toBe('/management/cells');
  expect(screen.queryByLabelText('Cell code')).toBeNull();
});

it('opens Audit with audit permission alone without requesting overview', async () => {
  fetchMock.mockImplementation(url =>
    String(url).endsWith('/session')
      ? respond({
          ...base,
          platformPermissions: ['admin-tenancy::control::audit'],
        })
      : respond([])
  );
  const router = mount('/control');
  await screen.findByRole('heading', { name: 'Audit' });
  expect(router.state.location.pathname).toBe('/management/audit');
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/overview'))).toBe(
    false
  );
});
it('keeps member commands reachable without overview permission', async () => {
  fetchMock.mockResolvedValue(
    reply({ ...base, platformPermissions: ['admin-tenancy::control::members'] })
  );
  const router = mount('/control');
  await screen.findByRole('heading', { name: 'Portal users' });
  expect(router.state.location.pathname).toBe('/management/portal-users');
  expect(screen.getAllByText('Revoke membership')[0]).toBeTruthy();
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/overview'))).toBe(
    false
  );
});
it('clears audit data after permission refusal', async () => {
  let revoked = false;
  fetchMock.mockImplementation(url =>
    String(url).endsWith('/session')
      ? respond({
          ...base,
          platformPermissions: revoked ? [] : ['admin-tenancy::control::audit'],
        })
      : revoked
        ? respond(null, 403)
        : respond([
            {
              id: membership,
              operator_id: id,
              effective_user_id: null,
              target_id: tenant,
              event: 'private-audit-event',
              reason: 'Fixture audit',
              created_at: '2026-09-13T00:00:00Z',
            },
          ])
  );
  mount('/management/audit');
  await screen.findByText(/private-audit-event/);
  revoked = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() =>
    expect(screen.queryByText(/private-audit-event/)).toBeNull()
  );
});
