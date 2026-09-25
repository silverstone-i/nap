/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { NavDrawer } from '../src/shell/NavDrawer.jsx';
import { SessionProvider } from '../src/auth/SessionContext.jsx';
import { ThemeModeProvider } from '../src/theme/ThemeModeContext.jsx';
import * as api from '../src/api/endpoints.js';
import { installMatchMedia } from './testUtils.jsx';

// A real `navigate()` call re-renders the whole router context with no
// `<Routes>` present in this isolated unit test to resolve it against,
// which races MUI's Modal FocusTrap in jsdom while the phone drawer is
// open (a testing-harness artifact — see the test that clicks a child
// below). What NavDrawer owns and this file tests is calling `onClose`
// after a selection, not the one-line `navigate(path)` pass-through.
vi.mock('react-router', async importOriginal => ({
  ...(await importOriginal()),
  useNavigate: () => vi.fn(),
}));

vi.mock('../src/api/endpoints.js', () => ({
  login: vi.fn(),
  changePassword: vi.fn(),
  logout: vi.fn(),
  getAccessContext: vi.fn(),
  listTenants: vi.fn(),
  selectTenant: vi.fn(),
}));

// A fixture standing in for the day Tenant Management has a real,
// authorized child — NavDrawer's own wiring (icons, active state, area
// gating) is what these tests exercise, not the (currently always empty)
// production authorization decision, which `tenantManagementNav.test.js`
// covers directly.
vi.mock('../src/shell/tenantManagementNav.js', () => ({
  TENANT_MANAGEMENT_CHILDREN: [
    { id: 'tenants', label: 'Tenants', path: '/management/tenants' },
  ],
  visibleTenantManagementChildren: vi.fn(() => [
    { id: 'tenants', label: 'Tenants', path: '/management/tenants' },
  ]),
}));

function renderDrawer(props, { path = '/management' } = {}) {
  return render(
    <ThemeModeProvider>
      <MemoryRouter initialEntries={[path]}>
        <SessionProvider>
          <NavDrawer homePath="/management" {...props} />
        </SessionProvider>
      </MemoryRouter>
    </ThemeModeProvider>
  );
}

beforeEach(() => {
  installMatchMedia();
  api.getAccessContext.mockResolvedValue({
    session: { restricted: false },
    user: { id: 'u1', email: 'root@example.com' },
    selectedTenant: null,
    operator: { id: 't1', code: 'NAP', name: 'Napsoft', tier: 'starter' },
    entryPoints: { platform: true, tenant: false },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('NavDrawer — area gating', () => {
  it('offers Tenant Management in the platform area', async () => {
    renderDrawer({ area: 'platform', variant: 'rail', expanded: true });
    expect(await screen.findByText('Home')).toBeTruthy();
    expect(screen.getByText('Tenant Management')).toBeTruthy();
    expect(screen.getByText('Tenants')).toBeTruthy();
  });

  it('never offers Tenant Management in the tenant area, even with visible children available', async () => {
    renderDrawer(
      { area: 'tenant', variant: 'rail', expanded: true },
      { path: '/app/tenant-1' }
    );
    expect(await screen.findByText('Home')).toBeTruthy();
    expect(screen.queryByText('Tenant Management')).toBeNull();
  });
});

describe('NavDrawer — expanded rail and phone drawer', () => {
  it('shows icons and labels with children nested under the group on the expanded rail', async () => {
    renderDrawer({ area: 'platform', variant: 'rail', expanded: true });
    expect(await screen.findByText('Tenant Management')).toBeTruthy();
    expect(screen.getByText('Tenants')).toBeTruthy();
  });

  it('shows the same icons-and-labels nesting in the phone drawer', async () => {
    renderDrawer({
      area: 'platform',
      variant: 'temporary',
      open: true,
      onClose: vi.fn(),
    });
    expect(await screen.findByText('Tenant Management')).toBeTruthy();
    expect(screen.getByText('Tenants')).toBeTruthy();
  });

  it('closes the phone drawer after selecting a child', async () => {
    // MUI's Modal FocusTrap records whatever is focused right before it
    // activates, to restore it on close. A real hamburger button plays
    // that role in the app; give the trap an equivalent real, stable
    // element here too, or jsdom is left with nothing valid to restore
    // focus to once a click inside the trap moves it — a testing-harness
    // gap, not a real browser behavior (the equivalent manual flow works
    // there).
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const user = userEvent.setup();
    const onClose = vi.fn();
    renderDrawer({
      area: 'platform',
      variant: 'temporary',
      open: true,
      onClose,
    });
    await user.click(await screen.findByText('Tenants'));
    expect(onClose).toHaveBeenCalled();

    opener.remove();
  });
});

describe('NavDrawer — collapsed rail', () => {
  it('keeps the group icon visible with an accessible name and opens a flyout with the child', async () => {
    const user = userEvent.setup();
    renderDrawer({ area: 'platform', variant: 'rail', expanded: false });
    const trigger = await screen.findByRole('button', {
      name: 'Tenant Management',
    });
    expect(screen.queryByText('Tenants')).toBeNull();

    await user.click(trigger);
    expect(
      await screen.findByRole('menuitem', { name: 'Tenants' })
    ).toBeTruthy();
  });
});

describe('NavDrawer — no visible children (I0001-R023 today)', () => {
  it('hides the group entirely when nothing is implemented and authorized', async () => {
    vi.mocked(
      (await import('../src/shell/tenantManagementNav.js'))
        .visibleTenantManagementChildren
    ).mockReturnValue([]);
    renderDrawer({ area: 'platform', variant: 'rail', expanded: true });
    expect(await screen.findByText('Home')).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByText('Tenant Management')).toBeNull()
    );
  });
});
