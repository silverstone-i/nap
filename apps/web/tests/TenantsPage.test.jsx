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

const READY_MULTI_TENANT = {
  session: { restricted: false },
  user: { id: 'u1', email: 'user@example.com' },
  selectedTenant: null,
  entryPoints: { platform: false, tenant: true },
};

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
  api.getAccessContext.mockResolvedValue(READY_MULTI_TENANT);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TenantsPage', () => {
  it('lists eligible tenants and selects one', async () => {
    api.listTenants.mockResolvedValue([
      {
        id: 'tenant-1',
        code: 'ACME',
        name: 'Acme Construction',
        tier: 'starter',
      },
    ]);
    api.selectTenant.mockResolvedValue({
      tenant: 'tenant-1',
      restricted: false,
    });

    renderAt('/tenants');
    const user = userEvent.setup();

    await screen.findByText('Acme Construction');
    await user.click(screen.getByText('Acme Construction'));

    await waitFor(() =>
      expect(screen.getByText('Acme Construction workspace.')).toBeTruthy()
    );
  });

  it('shows an empty state when there are no tenants', async () => {
    api.listTenants.mockResolvedValue([]);
    renderAt('/tenants');
    expect(
      await screen.findByText('You do not have access to any tenant yet.')
    ).toBeTruthy();
  });

  it('shows a retryable error when the list fails to load', async () => {
    api.listTenants.mockRejectedValueOnce(new Error('network'));
    api.listTenants.mockResolvedValueOnce([]);
    renderAt('/tenants');
    const user = userEvent.setup();

    await screen.findByText('Could not load your tenants.');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    expect(
      await screen.findByText('You do not have access to any tenant yet.')
    ).toBeTruthy();
  });
});
