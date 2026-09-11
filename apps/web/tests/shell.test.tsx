/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/// <reference lib="es2024.promise" />
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
import { readScope } from '../src/shell/scope.js';
import { requestContract } from '../src/api/request.js';
import { invalidateRequests } from '../src/api/lifecycle.js';
import { navigationResponseSchema } from '@nap/shared';
const tenant = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
const actor = '00000000-0000-4000-8000-000000000001';
const view = {
  actorId: actor,
  email: 'employee@nap.test',
  tenantId: tenant,
  tenantCode: 'TEST',
  tenantName: 'Test tenant',
  userType: 'employee',
  canChangeTenant: false,
  state: 'tenant-selected',
  platformPermissions: [],
  controlledAccess: null,
  expiresAt: '2099-01-01T00:00:00.000Z',
};
const fetchMock = vi.fn<typeof fetch>();
/**
 * Does: Creates a successful checked HTTP fixture.
 * Called by: route-specific response mocks.
 */
function reply(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ version: 1, data }), {
      headers: { 'Content-Type': 'application/json' },
    })
  );
}
/**
 * Does: Renders the actual routes with isolated history.
 * Called by: shell acceptance scenarios.
 */
function mount(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ThemeModeProvider>
      <RouterProvider router={router} />
    </ThemeModeProvider>
  );
  return router;
}
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  fetchMock.mockImplementation(url =>
    (typeof url === 'string'
      ? url
      : url instanceof URL
        ? url.href
        : url.url
    ).endsWith('/navigation')
      ? reply({ employees: true })
      : (typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url
          ).includes('/profile')
        ? reply({
            id: actor,
            name: 'Employee name',
            email: view.email,
            code: 'EMP',
          })
        : reply(view)
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders tenant branding, Dashboard and two-level navigation with working history', async () => {
  const router = mount(`/app/${tenant}/dashboard`);
  await screen.findByText('Dashboard widgets are under construction.');
  expect(screen.getByText('Test tenant')).toBeDefined();
  expect(screen.getByRole('link', { name: 'Skip to content' })).toBeDefined();
  expect(screen.queryByRole('link', { name: 'Tenants' })).toBeNull();
  fireEvent.click(screen.getByRole('link', { name: 'Directories' }));
  await screen.findByText('Employee name');
  expect(router.state.location.search).toBe('?tab=employees');
  fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
  await screen.findByText('Dashboard widgets are under construction.');
  await router.navigate(-1);
  await screen.findByText('Employee name');
});
it('normalizes the active tab on a direct load', async () => {
  const router = mount(`/app/${tenant}/accounting/directories?tab=unknown`);
  await screen.findByText('Employee name');
  expect(router.state.location.search).toBe('?tab=employees');
});
it('does not read a foreign tenant route for an ordinary user', async () => {
  mount(`/app/${other}/accounting/directories?tab=employees`);
  await screen.findByText('This destination is unavailable.');
  expect(
    fetchMock.mock.calls.every(([url]) =>
      (typeof url === 'string'
        ? url
        : url instanceof URL
          ? url.href
          : url.url
      ).endsWith('/session')
    )
  ).toBe(true);
});
it('returns a vendor mismatched bookmark to selection without selecting automatically', async () => {
  fetchMock.mockImplementation(url =>
    (typeof url === 'string'
      ? url
      : url instanceof URL
        ? url.href
        : url.url
    ).endsWith('/memberships')
      ? reply([
          {
            id: actor,
            tenantId: tenant,
            tenantCode: 'TEST',
            company: 'Test tenant',
            userType: 'vendor',
          },
        ])
      : reply({ ...view, userType: 'vendor', canChangeTenant: true })
  );
  const router = mount(`/app/${other}/dashboard`);
  await screen.findByRole('heading', { name: 'Choose tenant' });
  await screen.findByText(/requested destination is unavailable/);
  expect(router.state.location.pathname).toBe('/tenants');
  expect(
    fetchMock.mock.calls.some(([url]) =>
      (typeof url === 'string'
        ? url
        : url instanceof URL
          ? url.href
          : url.url
      ).endsWith('/select')
    )
  ).toBe(false);
});
it('clears content and rechecks the session after a permission refusal', async () => {
  fetchMock.mockImplementation(url =>
    (typeof url === 'string'
      ? url
      : url instanceof URL
        ? url.href
        : url.url
    ).endsWith('/navigation')
      ? reply({ employees: true })
      : (typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url
          ).includes('/profile')
        ? Promise.resolve(
            new Response(
              JSON.stringify({
                version: 1,
                code: 'FORBIDDEN',
                message: 'Access denied',
              }),
              { status: 403 }
            )
          )
        : reply(view)
  );
  mount(`/app/${tenant}/accounting/directories?tab=employees`);
  await screen.findByRole('button', { name: 'Recheck access' });
  expect(screen.queryByText('Employee name')).toBeNull();
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        (typeof url === 'string'
          ? url
          : url instanceof URL
            ? url.href
            : url.url
        ).endsWith('/session')
      ).length
    ).toBe(2)
  );
});
it('does not turn an ordinary record target into an unrestricted employee read', async () => {
  mount(`/app/${tenant}/accounting/directories?tab=employees&record=${other}`);
  await screen.findByText('Employee unavailable.');
  expect(
    fetchMock.mock.calls.some(([url]) =>
      (typeof url === 'string'
        ? url
        : url instanceof URL
          ? url.href
          : url.url
      ).includes('/profile')
    )
  ).toBe(false);
});
it('discards a successful pending response when the session changes', async () => {
  const pending = Promise.withResolvers<Response>();
  fetchMock.mockReturnValueOnce(pending.promise);
  const result = requestContract(
    '/api/core/v1/identity/navigation',
    navigationResponseSchema
  );
  invalidateRequests();
  pending.resolve(
    new Response(JSON.stringify({ version: 1, data: { employees: true } }))
  );
  expect(await result).toMatchObject({
    ok: false,
    error: { code: 'STALE_RESPONSE' },
  });
});
it('keeps navigation closed on mobile and closes it after choosing Dashboard', async () => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
  mount(`/app/${tenant}/dashboard`);
  await screen.findByText('Dashboard widgets are under construction.');
  expect(
    screen.queryByRole('navigation', { name: 'Main navigation' })
  ).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));
  fireEvent.click(await screen.findByRole('link', { name: 'Dashboard' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('navigation', { name: 'Main navigation' })
    ).toBeNull()
  );
  expect(document.activeElement).toBe(
    screen.getByRole('button', { name: 'Toggle navigation' })
  );
});
it('normalizes tenant and management identifiers independently', () => {
  expect(readScope(`/app/${tenant}/dashboard`, '')).toMatchObject({
    tenant,
    invalidTarget: false,
    invalidTenant: false,
  });
  expect(readScope(`/management/tenants/${other}`, '')).toMatchObject({
    target: other,
    central: true,
    tenant: null,
  });
});

it('enters explicit controlled employee access from the provisioning record', async () => {
  let controlled = false;
  fetchMock.mockImplementation(url => {
    const path =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (path.endsWith('/access')) {
      controlled = true;
      return reply(null);
    }
    if (path.endsWith('/navigation')) return reply({ employees: true });
    if (path.includes('/profile'))
      return reply({
        id: actor,
        name: 'Controlled employee',
        email: view.email,
        code: 'EMP',
      });
    if (path.endsWith('/overview'))
      return reply({
        cells: [],
        tenants: [
          {
            id: tenant,
            tenant_code: 'TEST',
            company: 'Test tenant',
            tier: 'starter',
            status: 'active',
            cell_id: null,
            provisioned: true,
          },
        ],
        users: [{ id: actor, email: view.email, status: 'active' }],
        members: [
          {
            id: other,
            portal_user_id: actor,
            tenant_id: tenant,
            status: 'active',
            user_type: 'employee',
            ready: true,
            entity_id: actor,
          },
        ],
        jobs: [],
        grants: [],
      });
    return reply({
      ...view,
      platformPermissions: [
        'admin-tenancy::control::overview',
        'admin-tenancy::control::access',
      ],
      controlledAccess: controlled
        ? { mode: 'access', operatorId: actor, reason: 'Test inspection' }
        : null,
    });
  });
  const router = mount(`/management/tenants/${tenant}`);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Inspect employee' })
  );
  fireEvent.mouseDown(
    await screen.findByRole('combobox', { name: 'Employee' })
  );
  fireEvent.click(await screen.findByRole('option', { name: view.email }));
  fireEvent.change(screen.getByLabelText('Access reason', { exact: false }), {
    target: { value: 'Test inspection' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Enter controlled access' })
  );
  await screen.findByText('Controlled employee');
  expect(router.state.location.pathname).toBe(
    `/app/${tenant}/accounting/directories`
  );
  expect(screen.getByRole('button', { name: 'Exit access' })).toBeDefined();
  expect(screen.queryByRole('link', { name: 'Tenants' })).toBeNull();
});

it('retains a tenant deep link through password change and vendor selection', async () => {
  let changed = false;
  let selected = false;
  const destination = `/app/${tenant}/dashboard`;
  fetchMock.mockImplementation(url => {
    const path =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (path.endsWith('/password')) {
      changed = true;
      return reply(null);
    }
    if (path.endsWith('/select')) {
      selected = true;
      return reply(null);
    }
    if (path.endsWith('/memberships'))
      return reply([
        {
          id: other,
          tenantId: tenant,
          tenantCode: 'TEST',
          company: 'Test tenant',
          userType: 'vendor',
        },
      ]);
    if (path.endsWith('/navigation')) return reply({ employees: false });
    return reply({
      ...view,
      userType: 'vendor',
      canChangeTenant: true,
      tenantId: selected ? tenant : null,
      state: selected
        ? 'tenant-selected'
        : changed
          ? 'tenant-selection-required'
          : 'password-change-required',
    });
  });
  const router = mount(`/login?next=${encodeURIComponent(destination)}`);
  fireEvent.change(
    await screen.findByLabelText('Current password', { exact: false }),
    { target: { value: 'test-password-original' } }
  );
  fireEvent.change(screen.getByLabelText(/^New password/), {
    target: { value: 'test-password-replacement' },
  });
  fireEvent.change(
    screen.getByLabelText('Confirm new password', { exact: false }),
    { target: { value: 'test-password-replacement' } }
  );
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Test tenant (TEST)' })
  );
  await screen.findByText('Dashboard widgets are under construction.');
  expect(router.state.location.pathname).toBe(destination);
});

it('clears an expired employee session and preserves the destination for login', async () => {
  fetchMock.mockImplementation(url => {
    const path =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (path.endsWith('/navigation')) return reply({ employees: true });
    if (path.includes('/profile'))
      return Promise.resolve(
        new Response(
          JSON.stringify({
            version: 1,
            code: 'UNAUTHENTICATED',
            message: 'Authentication required',
          }),
          { status: 401 }
        )
      );
    return reply(view);
  });
  const destination = `/app/${tenant}/accounting/directories?tab=employees`;
  const router = mount(destination);
  await screen.findByRole('button', { name: 'Sign in' });
  expect(router.state.location.pathname).toBe('/login');
  expect(new URLSearchParams(router.state.location.search).get('next')).toBe(
    destination
  );
  expect(screen.queryByRole('heading', { name: 'Employees' })).toBeNull();
});

it('opens the initial profile menu, changes mode, and reaches password management', async () => {
  const router = mount(`/app/${tenant}/dashboard`);
  const profile = await screen.findByRole('button', {
    name: `Profile: ${view.email}`,
  });
  expect(profile.textContent).toBe('E');
  fireEvent.click(profile);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Mode' }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Light' }));
  expect(localStorage.getItem('nap:theme-mode')).toBe('light');
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  fireEvent.click(profile);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Change password' }));
  await screen.findByLabelText('Current password', { exact: false });
  expect(router.state.location.pathname).toBe('/account/password');
});

it('logs out through the profile menu', async () => {
  fetchMock.mockImplementation(url => {
    const path =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (path.endsWith('/logout')) return reply(null);
    if (path.endsWith('/navigation')) return reply({ employees: true });
    return reply(view);
  });
  const router = mount(`/app/${tenant}/dashboard`);
  fireEvent.click(
    await screen.findByRole('button', { name: `Profile: ${view.email}` })
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'Logout' }));
  await screen.findByRole('button', { name: 'Sign in' });
  expect(router.state.location.pathname).toBe('/login');
});

/**
 * Does: Supplies management records and action permissions to the real page routes.
 * Called by: management layout and interaction regression tests.
 */
function managementFixture(
  permissions = ['overview', 'registry', 'members', 'provision']
) {
  fetchMock.mockImplementation(url => {
    const path =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (path.endsWith('/overview'))
      return reply({
        cells: [{ id: other, code: 'CELL', name: 'Test cell', enabled: true }],
        tenants: [
          {
            id: tenant,
            tenant_code: 'TEST',
            company: 'Test tenant',
            tier: 'starter',
            status: 'active',
            cell_id: other,
            provisioned: true,
          },
          {
            id: other,
            tenant_code: 'OTHER',
            company: 'Other tenant',
            tier: 'growth',
            status: 'pending',
            cell_id: other,
            provisioned: false,
          },
        ],
        users: [{ id: actor, email: view.email, status: 'active' }],
        members: [
          {
            id: other,
            portal_user_id: actor,
            tenant_id: tenant,
            status: 'active',
            user_type: 'employee',
            ready: true,
            entity_id: actor,
          },
        ],
        jobs: [],
        grants: [],
      });
    if (
      ['/members', '/registry', '/provision'].some(action =>
        path.endsWith(action)
      )
    )
      return reply({ jobId: null });
    return reply({
      ...view,
      platformPermissions: permissions.map(p => `admin-tenancy::control::${p}`),
    });
  });
}

it('filters management grids through URL state and keeps actions focused on the current feature', async () => {
  managementFixture();
  const router = mount('/management/tenants');
  await screen.findByRole('grid', { name: 'Tenants' });
  expect(screen.queryByRole('navigation', { name: 'Breadcrumbs' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Operator utilities' })).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
  const search = screen.getByRole('textbox', { name: 'Search tenants' });
  fireEvent.change(search, { target: { value: 'Other' } });
  expect(router.state.location.search).toContain('q=Other');
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Actions for Test tenant' })
    ).toBeNull()
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Actions for Other tenant' })
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'View tenant' }));
  await screen.findByRole('heading', { name: 'Other tenant', level: 1 });
  expect(
    screen.queryByRole('combobox', { name: 'Initial administrator' })
  ).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Activate tenant' }));
  expect(
    screen.getByRole('combobox', { name: 'Initial administrator' })
  ).toBeDefined();
  await router.navigate(-1);
  expect(await screen.findByDisplayValue('Other')).toBeDefined();
});

it('opens portal-user memberships and prefills a record-specific linking form', async () => {
  managementFixture();
  const router = mount('/management/portal-users');
  await screen.findByRole('grid', { name: 'Portal users' });
  fireEvent.click(
    screen.getByRole('button', { name: `Actions for ${view.email}` })
  );
  fireEvent.click(screen.getByRole('menuitem', { name: 'View memberships' }));
  await screen.findByRole('heading', { name: 'Tenant memberships' });
  expect(router.state.location.search).toBe(`?record=${actor}`);
  fireEvent.click(
    screen.getByRole('link', { name: 'Create or link portal user' })
  );
  await screen.findByRole('button', { name: 'Provision user' });
  expect(screen.getByDisplayValue(view.email)).toBeDefined();
  expect(
    screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')
  ).toBe('/management/portal-users');
  fireEvent.change(
    screen.getByLabelText('Employee or contact name', { exact: false }),
    { target: { value: 'Example employee' } }
  );
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tenant' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Test tenant' }));
  fireEvent.click(screen.getByRole('button', { name: 'Provision user' }));
  await screen.findByRole('grid', { name: 'Portal users' });
  expect(router.state.location.pathname).toBe('/management/portal-users');
});

it('hides unavailable management mutations and exposes the collapsed navigation group flyout', async () => {
  managementFixture(['overview']);
  mount('/management/tenants');
  await screen.findByRole('grid', { name: 'Tenants' });
  expect(screen.queryByRole('link', { name: 'Create tenant' })).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Actions for Test tenant' })
  );
  expect(
    screen.queryByRole('menuitem', { name: 'Create or link portal user' })
  ).toBeNull();
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Tenant Management' }));
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Portal users' })
  );
  await screen.findByRole('grid', { name: 'Portal users' });
});

it('retains a failed creation form and displays the server error', async () => {
  managementFixture();
  const original = fetchMock.getMockImplementation();
  fetchMock.mockImplementation((url, init) => {
    const path =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (path.endsWith('/registry'))
      return Promise.resolve(
        new Response(
          JSON.stringify({
            version: 1,
            code: 'CONFLICT',
            message: 'Tenant code already exists.',
          }),
          { status: 409 }
        )
      );
    if (!original) throw new Error('Management fixture missing');
    return original(url, init);
  });
  mount('/management/tenants/new');
  fireEvent.change(
    await screen.findByLabelText('Tenant code', { exact: false }),
    { target: { value: 'TEST' } }
  );
  fireEvent.change(screen.getByLabelText('Tenant name', { exact: false }), {
    target: { value: 'Keep my draft' },
  });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Assigned cell' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Test cell' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Create pending tenant' })
  );
  await screen.findByText('Tenant code already exists.');
  expect(screen.getByDisplayValue('Keep my draft')).toBeDefined();
  expect(
    screen
      .getByRole('button', { name: 'Create pending tenant' })
      .hasAttribute('disabled')
  ).toBe(false);
});

it('restores status filtering and sorting from a management bookmark', async () => {
  managementFixture();
  mount(
    '/management/tenants?status=pending&sort=label&direction=desc&page=999'
  );
  await screen.findByRole('grid', { name: 'Tenants' });
  expect(
    screen.getByRole('button', { name: 'Actions for Other tenant' })
  ).toBeDefined();
  expect(
    screen.queryByRole('button', { name: 'Actions for Test tenant' })
  ).toBeNull();
  expect(
    screen
      .getByRole('columnheader', { name: /^Tenant/ })
      .getAttribute('aria-sort')
  ).toBe('descending');
});

it('clears a navigation failure while refetching after returning from management', async () => {
  managementFixture();
  const fallback = fetchMock.getMockImplementation()!;
  const pending = Promise.withResolvers<Response>();
  let calls = 0;
  fetchMock.mockImplementation((url, init) => {
    const path =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    if (path.endsWith('/navigation')) {
      calls++;
      if (calls === 1) return Promise.reject(new Error('Offline'));
      return pending.promise;
    }
    return fallback(url, init);
  });
  const router = mount(`/app/${tenant}/dashboard`);
  await screen.findByText('The server could not be reached');
  await router.navigate('/management/tenants');
  await screen.findByRole('heading', { name: 'Tenants' });
  await router.navigate(`/app/${tenant}/dashboard`);
  await waitFor(() => expect(calls).toBe(2));
  expect(screen.queryByText('The server could not be reached')).toBeNull();
  expect(
    screen.queryByText('Dashboard widgets are under construction.')
  ).toBeNull();
  expect(screen.getByText('Loading…')).toBeDefined();
  pending.resolve(await reply({ employees: true }));
  await screen.findByText('Dashboard widgets are under construction.');
  expect(screen.queryByText('The server could not be reached')).toBeNull();
});
