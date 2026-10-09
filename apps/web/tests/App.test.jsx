/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { App } from '../src/App.jsx';
import { ThemeModeProvider } from '../src/theme/ThemeModeContext.jsx';
import { ApiError } from '../src/api/client.js';
import * as api from '../src/api/endpoints.js';
import {
  NO_CAPABILITIES,
  capabilitiesFixture,
  installMatchMedia,
} from './testUtils.jsx';

vi.mock('../src/api/endpoints.js', () => ({
  login: vi.fn(),
  changePassword: vi.fn(),
  logout: vi.fn(),
  getAccessContext: vi.fn(),
  getSessionCapabilities: vi.fn(),
  listTenants: vi.fn(),
  selectTenant: vi.fn(),
}));

beforeEach(() => {
  installMatchMedia();
  api.getAccessContext.mockRejectedValue(new ApiError('UNAUTHENTICATED', 401));
  api.getSessionCapabilities.mockResolvedValue(NO_CAPABILITIES);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('sends an unauthenticated visitor to /login', async () => {
  render(
    <ThemeModeProvider>
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    </ThemeModeProvider>
  );
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
});

const napsoft = { id: 't1', code: 'NAP', name: 'Napsoft', tier: 'starter' };

function renderAt(path) {
  return render(
    <ThemeModeProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ThemeModeProvider>
  );
}

it('sends management access with eligible tenants to tenant selection (I0001-R003)', async () => {
  api.getAccessContext.mockResolvedValue({
    session: { restricted: false },
    user: { id: 'u1', email: 'root@example.com' },
    selectedTenant: null,
    operator: napsoft,
    entryPoints: { tenant: true },
  });
  api.getSessionCapabilities.mockResolvedValue(capabilitiesFixture());
  api.listTenants.mockResolvedValue([napsoft]);
  renderAt('/');
  expect(await screen.findByText('Napsoft')).toBeTruthy();
  expect(screen.queryByText('No tenant selected.')).toBeNull();
});

it('lands management access with no eligible tenant on Home (one shell)', async () => {
  api.getAccessContext.mockResolvedValue({
    session: { restricted: false },
    user: { id: 'u1', email: 'root@example.com' },
    selectedTenant: null,
    operator: napsoft,
    entryPoints: { tenant: false },
  });
  api.getSessionCapabilities.mockResolvedValue(capabilitiesFixture());
  renderAt('/');
  expect(await screen.findByText('No tenant selected.')).toBeTruthy();
  expect(screen.getByText('Tenant Management')).toBeTruthy();
});

it('keeps Tenant Management in the one shell with a tenant selected', async () => {
  api.getAccessContext.mockResolvedValue({
    session: { restricted: false },
    user: { id: 'u1', email: 'root@example.com' },
    selectedTenant: napsoft,
    operator: napsoft,
    entryPoints: { tenant: true },
  });
  api.getSessionCapabilities.mockResolvedValue(capabilitiesFixture());
  renderAt('/');
  expect(await screen.findByText('Napsoft workspace.')).toBeTruthy();
  expect(screen.getByText('Tenant Management')).toBeTruthy();
});

it('lets a user with a tenant selected open tenant selection to switch', async () => {
  api.getAccessContext.mockResolvedValue({
    session: { restricted: false },
    user: { id: 'u1', email: 'user@example.com' },
    selectedTenant: napsoft,
    operator: napsoft,
    entryPoints: { tenant: true },
  });
  api.listTenants.mockResolvedValue([napsoft]);
  renderAt('/tenants');
  expect(
    await screen.findByRole('heading', { name: 'Choose a tenant' })
  ).toBeTruthy();
});

it('sends a tenant-only user with no selection to tenant selection', async () => {
  api.getAccessContext.mockResolvedValue({
    session: { restricted: false },
    user: { id: 'u1', email: 'user@example.com' },
    selectedTenant: null,
    operator: napsoft,
    entryPoints: { tenant: true },
  });
  api.listTenants.mockResolvedValue([napsoft]);
  renderAt('/home');
  expect(
    await screen.findByRole('heading', { name: 'Choose a tenant' })
  ).toBeTruthy();
});

it('leaves /password for the destination after a required change (I0001-R002)', async () => {
  api.getAccessContext.mockRejectedValueOnce(
    new ApiError('PASSWORD_CHANGE_REQUIRED', 403)
  );
  renderAt('/password');
  const user = userEvent.setup();
  await user.type(
    await screen.findByLabelText(/Current password/, { selector: 'input' }),
    'temporary-password'
  );
  await user.type(
    screen.getByLabelText(/New password/, { selector: 'input' }),
    'a-new-long-password'
  );
  api.changePassword.mockResolvedValue(undefined);
  // A real reload takes a network round trip, so the loading state renders.
  api.getAccessContext.mockImplementation(
    () =>
      new Promise(resolve =>
        setTimeout(
          () =>
            resolve({
              session: { restricted: false },
              user: { id: 'u1', email: 'root@example.com' },
              selectedTenant: null,
              operator: napsoft,
              entryPoints: { tenant: false },
            }),
          20
        )
      )
  );
  api.getSessionCapabilities.mockResolvedValue(capabilitiesFixture());
  await user.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByText('No tenant selected.')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Change password' })).toBeNull();
});

const readyContext = {
  session: { restricted: false },
  user: { id: 'u1', email: 'root@example.com' },
  selectedTenant: null,
  operator: napsoft,
  entryPoints: { tenant: false },
};

it('offers Cancel, not Logout, on a voluntary password change', async () => {
  const user = userEvent.setup();
  api.getAccessContext.mockResolvedValue(readyContext);
  api.getSessionCapabilities.mockResolvedValue(capabilitiesFixture());
  render(
    <ThemeModeProvider>
      <MemoryRouter initialEntries={['/home', '/password']} initialIndex={1}>
        <App />
      </MemoryRouter>
    </ThemeModeProvider>
  );
  await user.click(await screen.findByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('button', { name: 'Logout' })).toBeNull();
  expect(await screen.findByText('No tenant selected.')).toBeTruthy();
  expect(api.changePassword).not.toHaveBeenCalled();
});

it('offers Logout, not Cancel, on a required password change', async () => {
  api.getAccessContext.mockRejectedValue(
    new ApiError('PASSWORD_CHANGE_REQUIRED', 403)
  );
  renderAt('/password');
  expect(await screen.findByRole('button', { name: 'Logout' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
});
