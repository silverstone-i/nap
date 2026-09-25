/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function renderAt(path) {
  return render(
    <ThemeModeProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </ThemeModeProvider>
  );
}

beforeEach(() => {
  installMatchMedia();
  api.getAccessContext.mockRejectedValue(new ApiError('UNAUTHENTICATED', 401));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  it('shows one generic message for a rejected login', async () => {
    api.login.mockRejectedValue(new ApiError('UNAUTHENTICATED', 401));
    renderAt('/login');
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Sign in' });
    await user.type(screen.getByLabelText(/Email/), 'wrong@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('Incorrect email or password.')
    ).toBeTruthy();
  });

  it('shows retry timing for a throttled login', async () => {
    api.login.mockRejectedValue(
      Object.assign(new ApiError('THROTTLED', 429, 30))
    );
    renderAt('/login');
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Sign in' });
    await user.type(screen.getByLabelText(/Email/), 'user@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText(/Try again in 30 seconds/)).toBeTruthy();
  });

  it('redirects to Home after a successful login with platform entry', async () => {
    api.login.mockResolvedValue({ restricted: false });
    renderAt('/login');
    await screen.findByRole('heading', { name: 'Sign in' });

    // The mount-time load stays anonymous (beforeEach); queue the *next*
    // call — the refresh login() triggers on success — to return a ready
    // platform-only context.
    api.getAccessContext.mockResolvedValueOnce({
      session: { restricted: false },
      user: { id: 'u1', email: 'root@example.com' },
      selectedTenant: null,
      entryPoints: { platform: true, tenant: false },
    });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Email/), 'root@example.com');
    await user.type(screen.getByLabelText(/^Password/), 'password');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(screen.getByText('No tenant selected.')).toBeTruthy()
    );
    // I0001-R023, AC16 empty-group case, exercised end to end with the real
    // (unmocked) `tenantManagementNav.js`: this fixture's `entryPoints`
    // carries no `tenantManagement` signal at all, so every child stays
    // unauthorized (I0002-R010 — implemented alone is not sufficient) and
    // only Home appears in the navigation.
    expect(screen.getByRole('button', { name: 'Home' })).toBeTruthy();
    expect(screen.queryByText('Tenant Management')).toBeNull();
  });
  describe('auto-selects a single tenant after login (I0001-R003)', () => {
    const napsoft = { id: 't1', code: 'NAP', name: 'Napsoft', tier: 'starter' };
    const other = { id: 't2', code: 'ACME', name: 'Acme', tier: 'starter' };
    const context = {
      session: { restricted: false },
      user: { id: 'u1', email: 'root@example.com' },
      selectedTenant: null,
      operator: napsoft,
      entryPoints: { platform: true, tenant: true },
    };

    async function signIn() {
      api.login.mockResolvedValue({ restricted: false });
      renderAt('/login');
      await screen.findByRole('heading', { name: 'Sign in' });
      api.getAccessContext.mockResolvedValueOnce(context);
      const user = userEvent.setup();
      await user.type(screen.getByLabelText(/Email/), 'root@example.com');
      await user.type(screen.getByLabelText(/^Password/), 'password');
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
    }

    it('selects the only eligible tenant and lands on its Home', async () => {
      api.listTenants.mockResolvedValue([napsoft]);
      api.selectTenant.mockResolvedValue({ restricted: false, tenant: 't1' });
      await signIn();
      expect(await screen.findByText('Napsoft workspace.')).toBeTruthy();
      expect(api.selectTenant).toHaveBeenCalledWith('t1');
    });

    it('leaves the choice to the user when several tenants are eligible', async () => {
      api.listTenants.mockResolvedValue([napsoft, other]);
      await signIn();
      expect(await screen.findByText('No tenant selected.')).toBeTruthy();
      expect(api.selectTenant).not.toHaveBeenCalled();
    });

    it('stays unselected when the only tenant cannot be selected', async () => {
      api.listTenants.mockResolvedValue([napsoft]);
      api.selectTenant.mockRejectedValue(new ApiError('CELL_UNAVAILABLE', 503));
      await signIn();
      expect(await screen.findByText('No tenant selected.')).toBeTruthy();
    });
  });
});
