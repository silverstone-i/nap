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
import { NO_CAPABILITIES, installMatchMedia } from './testUtils.jsx';

vi.mock('../src/api/endpoints.js', () => ({
  login: vi.fn(),
  changePassword: vi.fn(),
  logout: vi.fn(),
  getAccessContext: vi.fn(),
  getSessionCapabilities: vi.fn(),
  listTenants: vi.fn(),
  selectTenant: vi.fn(),
}));

const READY_MULTI_TENANT = {
  session: { restricted: false },
  user: { id: 'u1', email: 'user@example.com' },
  selectedTenant: null,
  entryPoints: { tenant: true },
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
  api.getSessionCapabilities.mockResolvedValue(NO_CAPABILITIES);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TenantsPage', () => {
  it('lists eligible tenants and selects one by membership (I0012-R009)', async () => {
    const tenant = {
      id: 'tenant-1',
      code: 'ACME',
      name: 'Acme Construction',
      tier: 'starter',
    };
    api.listTenants.mockResolvedValue([
      { membershipId: 'm-1', tenant, memberType: 'employee', label: null },
    ]);
    api.selectTenant.mockResolvedValue({
      tenant: 'tenant-1',
      restricted: false,
    });

    renderAt('/tenants');
    const user = userEvent.setup();

    await screen.findByText('Acme Construction');
    api.getAccessContext.mockResolvedValueOnce({
      ...READY_MULTI_TENANT,
      selectedTenant: tenant,
      membership: { id: 'm-1', memberType: 'employee', label: null },
      membershipsInTenant: 1,
    });
    await user.click(screen.getByText('Acme Construction'));

    expect(api.selectTenant).toHaveBeenCalledWith('m-1');
    await waitFor(() =>
      expect(screen.getByText('Acme Construction workspace.')).toBeTruthy()
    );
  });

  it('lists each party in a tenant and names the selected one in the header (I0012-R010, R012)', async () => {
    const tenant = {
      id: 'tenant-1',
      code: 'ACME',
      name: 'Acme Construction',
      tier: 'starter',
    };
    const vendor = {
      id: 'm-2',
      memberType: 'vendor_contact',
      label: 'Vendor · Black Plumbing',
    };
    api.listTenants.mockResolvedValue([
      {
        membershipId: 'm-1',
        tenant,
        memberType: 'employee',
        label: 'Employee',
      },
      {
        membershipId: vendor.id,
        tenant,
        memberType: vendor.memberType,
        label: vendor.label,
      },
    ]);
    api.selectTenant.mockResolvedValue({
      tenant: 'tenant-1',
      restricted: false,
    });

    renderAt('/tenants');
    const user = userEvent.setup();

    expect(await screen.findByText('Employee')).toBeTruthy();
    expect(screen.getAllByText('Acme Construction')).toHaveLength(2);
    api.getAccessContext.mockResolvedValueOnce({
      ...READY_MULTI_TENANT,
      selectedTenant: tenant,
      membership: vendor,
      membershipsInTenant: 2,
    });
    await user.click(screen.getByText('Vendor · Black Plumbing'));

    expect(api.selectTenant).toHaveBeenCalledWith('m-2');
    expect(
      await screen.findByRole('button', {
        name: /Selected tenant: Acme Construction · Vendor · Black Plumbing/,
      })
    ).toBeTruthy();
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
