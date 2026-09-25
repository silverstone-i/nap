/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { App } from '../src/App.jsx';
import { ThemeModeProvider } from '../src/theme/ThemeModeContext.jsx';
import { ApiError } from '../src/api/client.js';
import * as api from '../src/api/endpoints.js';
import { installMatchMedia } from './testUtils.jsx';

vi.mock('../src/api/endpoints.js', () => ({
  login: vi.fn(),
  changePassword: vi.fn(),
  logout: vi.fn(),
  getAccessContext: vi.fn(),
  listTenants: vi.fn(),
  selectTenant: vi.fn(),
}));

beforeEach(() => {
  installMatchMedia();
  api.getAccessContext.mockRejectedValue(new ApiError('UNAUTHENTICATED', 401));
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
const allCells = { tenants: true, cells: true, portalUsers: true };

function renderAt(path) {
  return render(
    <ThemeModeProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ThemeModeProvider>
  );
}

it('lands management access on Home with no tenant selected (one shell)', async () => {
  api.getAccessContext.mockResolvedValue({
    session: { restricted: false },
    user: { id: 'u1', email: 'root@example.com' },
    selectedTenant: null,
    operator: napsoft,
    entryPoints: { platform: true, tenant: true, tenantManagement: allCells },
  });
  renderAt('/');
  expect(await screen.findByText('No tenant selected.')).toBeTruthy();
  expect(screen.getByText('Tenant Management')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: /Open tenant selection/ })
  ).toBeTruthy();
});

it('keeps Tenant Management in the one shell with a tenant selected', async () => {
  api.getAccessContext.mockResolvedValue({
    session: { restricted: false },
    user: { id: 'u1', email: 'root@example.com' },
    selectedTenant: napsoft,
    operator: napsoft,
    entryPoints: { platform: true, tenant: true, tenantManagement: allCells },
  });
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
    entryPoints: { platform: false, tenant: true },
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
    entryPoints: { platform: false, tenant: true },
  });
  api.listTenants.mockResolvedValue([napsoft]);
  renderAt('/home');
  expect(
    await screen.findByRole('heading', { name: 'Choose a tenant' })
  ).toBeTruthy();
});
