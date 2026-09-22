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

  it('redirects to the platform shell after a successful login with platform entry', async () => {
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
      expect(screen.getByText('Platform administration.')).toBeTruthy()
    );
    // F0001-R023, AC16 empty-group case, exercised end to end with the real
    // (unmocked) `tenantManagementNav.js`: no child is implemented and
    // server-authorized today, so the group stays hidden and only Home
    // appears in the platform shell's navigation.
    expect(screen.getByRole('button', { name: 'Home' })).toBeTruthy();
    expect(screen.queryByText('Tenant Management')).toBeNull();
  });
});
