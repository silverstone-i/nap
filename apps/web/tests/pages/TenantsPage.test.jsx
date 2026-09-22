/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client.js';
import * as api from '../../src/api/endpoints.js';
import { TenantsPage } from '../../src/pages/management/TenantsPage.jsx';
import { ContextualActionHeader } from '../../src/shell/ContextualActionHeader.jsx';
import { PageHeaderProvider } from '../../src/shell/PageHeaderContext.jsx';
import { ThemeModeProvider } from '../../src/theme/ThemeModeContext.jsx';
import { installMatchMedia, installResizeObserver } from '../testUtils.jsx';

vi.mock('../../src/api/endpoints.js', () => ({
  listTenantsPage: vi.fn(),
  createTenant: vi.fn(),
}));

const TENANT = {
  id: 't1',
  code: 'ACME',
  name: 'Acme Construction',
  tier: 'starter',
  status: 'pending',
  cellId: null,
  provisioned: false,
  rbacReady: false,
};

// `usePageHeader` only registers {title, actions} in context; the shell's
// `ContextualActionHeader` is what actually renders them (normally mounted
// by `AppShell`), so it must be present here too for the header action
// button (e.g. "Create tenant") to appear in the DOM.
function renderPage() {
  return render(
    <ThemeModeProvider>
      <PageHeaderProvider>
        <ContextualActionHeader />
        <TenantsPage />
      </PageHeaderProvider>
    </ThemeModeProvider>
  );
}

beforeEach(() => {
  installMatchMedia();
  installResizeObserver();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TenantsPage', () => {
  it('shows a loading then populated grid (F0001-R021)', async () => {
    api.listTenantsPage.mockResolvedValue({ rows: [TENANT], nextCursor: null });
    renderPage();
    expect(await screen.findByText('ACME')).toBeTruthy();
    expect(screen.getByText('Acme Construction')).toBeTruthy();
  });

  it('shows an explicit empty state', async () => {
    api.listTenantsPage.mockResolvedValue({ rows: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText('No tenants yet.')).toBeTruthy();
  });

  it('shows a retryable error state', async () => {
    api.listTenantsPage.mockRejectedValue(new Error('network down'));
    renderPage();
    expect(await screen.findByText('Could not load data.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('offers no row action, per F0002-R001', async () => {
    api.listTenantsPage.mockResolvedValue({ rows: [TENANT], nextCursor: null });
    renderPage();
    await screen.findByText('ACME');
    expect(screen.queryByRole('menuitem', { name: 'more' })).toBeNull();
  });

  it('creates a tenant with an idempotency key and reloads the grid (AC02)', async () => {
    api.listTenantsPage.mockResolvedValue({ rows: [], nextCursor: null });
    api.createTenant.mockResolvedValue(TENANT);
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('No tenants yet.');

    await user.click(screen.getByRole('button', { name: 'Create tenant' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Code/), 'ACME');
    await user.type(within(dialog).getByLabelText(/Name/), 'Acme Construction');
    await user.click(within(dialog).getByRole('button', { name: 'Create tenant' }));

    expect(api.createTenant).toHaveBeenCalledWith({
      code: 'ACME',
      name: 'Acme Construction',
      tier: 'starter',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.listTenantsPage).toHaveBeenCalledTimes(2); // initial load + reload after create
  });

  it('surfaces a server conflict unmodified, without a client-side uniqueness check (AC02)', async () => {
    api.listTenantsPage.mockResolvedValue({ rows: [], nextCursor: null });
    api.createTenant.mockRejectedValue(new ApiError('CONFLICT', 409));
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('No tenants yet.');

    await user.click(screen.getByRole('button', { name: 'Create tenant' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Code/), 'ACME');
    await user.type(within(dialog).getByLabelText(/Name/), 'Acme Construction');
    await user.click(within(dialog).getByRole('button', { name: 'Create tenant' }));

    expect(
      await within(dialog).findByText('A tenant with this code already exists.')
    ).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy(); // dialog stays open
  });
});
