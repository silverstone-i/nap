/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client.js';
import * as api from '../../src/api/endpoints.js';
import { useSession } from '../../src/auth/SessionContext.jsx';
import { TenantsPage } from '../../src/pages/management/TenantsPage.jsx';
import { ContextualActionHeader } from '../../src/shell/ContextualActionHeader.jsx';
import { PageHeaderProvider } from '../../src/shell/PageHeaderContext.jsx';
import { ThemeModeProvider } from '../../src/theme/ThemeModeContext.jsx';
import {
  capabilitiesFixture,
  installMatchMedia,
  installResizeObserver,
} from '../testUtils.jsx';

vi.mock('../../src/api/endpoints.js', () => ({
  listTenantsPage: vi.fn(),
  createTenant: vi.fn(),
  listCellsOverview: vi.fn(),
  provisionTenant: vi.fn(),
  retryTenantProvisioning: vi.fn(),
}));

vi.mock('../../src/auth/SessionContext.jsx', () => ({
  useSession: vi.fn(),
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
  job: null,
};

const page = (rows, anyActive = false) => ({
  rows,
  nextCursor: null,
  anyActive,
});

const failedJob = {
  tenantId: 't1',
  cellId: 'c1',
  stage: 'seed',
  status: 'failed',
  attempts: 0,
  failureCode: 'SEED_FAILED',
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
  useSession.mockReturnValue({
    capabilities: capabilitiesFixture(),
    refreshCapabilities: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TenantsPage', () => {
  it('shows a loading then populated grid (I0001-R021)', async () => {
    api.listTenantsPage.mockResolvedValue(page([TENANT]));
    renderPage();
    expect(await screen.findByText('ACME')).toBeTruthy();
    expect(screen.getByText('Acme Construction')).toBeTruthy();
  });

  it('shows an explicit empty state', async () => {
    api.listTenantsPage.mockResolvedValue(page([]));
    renderPage();
    expect(await screen.findByText('No tenants yet.')).toBeTruthy();
  });

  it('shows a retryable error state', async () => {
    api.listTenantsPage.mockRejectedValue(new Error('network down'));
    renderPage();
    expect(await screen.findByText('Could not load data.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('provisions a pending tenant into a ready cell (I0006-R010, AC09)', async () => {
    api.listTenantsPage.mockResolvedValue(page([TENANT]));
    api.listCellsOverview.mockResolvedValue({
      rows: [
        { cell: { id: 'c1', database_name: 'nap_dev_cell_a' }, ready: true },
        { cell: { id: 'c2', database_name: 'nap_dev_cell_b' }, ready: false },
      ],
      nextCursor: null,
      anyActive: false,
    });
    api.provisionTenant.mockResolvedValue({});
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('ACME');

    await user.click(screen.getByRole('menuitem', { name: 'more' }));
    expect(screen.queryByRole('menuitem', { name: 'Retry' })).toBeNull();
    await user.click(
      await screen.findByRole('menuitem', { name: 'Provision' })
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox'));
    expect(screen.queryByRole('option', { name: 'nap_dev_cell_b' })).toBeNull();
    await user.click(
      await screen.findByRole('option', { name: 'nap_dev_cell_a' })
    );
    await user.type(
      within(dialog).getByLabelText(/Administrator email/),
      'admin@acme.test'
    );
    await user.type(
      within(dialog).getByLabelText(/Temporary password/),
      'temporary'
    );
    await user.click(within(dialog).getByRole('button', { name: 'Provision' }));

    expect(api.provisionTenant).toHaveBeenCalledWith({
      tenant: 't1',
      cell: 'c1',
      email: 'admin@acme.test',
      password: 'temporary',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('offers Retry only for a failed job, and shows its failure (I0006-R012)', async () => {
    api.listTenantsPage.mockResolvedValue(
      page([{ ...TENANT, cellId: 'c1', job: failedJob }])
    );
    api.retryTenantProvisioning.mockResolvedValue({});
    renderPage();
    const user = userEvent.setup();
    expect(await screen.findByText('SEED_FAILED')).toBeTruthy();

    await user.click(screen.getByRole('menuitem', { name: 'more' }));
    expect(screen.queryByRole('menuitem', { name: 'Provision' })).toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: 'Retry' }));
    expect(api.retryTenantProvisioning).toHaveBeenCalledWith({ tenant: 't1' });
  });

  it('offers no action for a provisioned tenant', async () => {
    api.listTenantsPage.mockResolvedValue(
      page([
        {
          ...TENANT,
          status: 'active',
          cellId: 'c1',
          provisioned: true,
          rbacReady: true,
          job: {
            ...failedJob,
            stage: 'complete',
            status: 'completed',
            failureCode: null,
          },
        },
      ])
    );
    renderPage();
    await screen.findByText('ACME');
    expect(screen.queryByRole('menuitem', { name: 'more' })).toBeNull();
  });

  it('refreshes every 2 seconds while a job is active, and stops after (I0006-R011)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const running = { ...failedJob, status: 'running', failureCode: null };
      const done = { ...running, stage: 'complete', status: 'completed' };
      api.listTenantsPage
        .mockResolvedValueOnce(page([{ ...TENANT, job: running }], true))
        .mockResolvedValue(page([{ ...TENANT, job: done }], false));
      renderPage();
      await screen.findByText('running');
      await vi.advanceTimersByTimeAsync(2000);
      await screen.findByText('completed');
      const calls = api.listTenantsPage.mock.calls.length;
      await vi.advanceTimersByTimeAsync(6000);
      expect(api.listTenantsPage).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it('creates a tenant with an idempotency key and reloads the grid (AC02)', async () => {
    api.listTenantsPage.mockResolvedValue(page([]));
    api.createTenant.mockResolvedValue(TENANT);
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('No tenants yet.');

    await user.click(screen.getByRole('button', { name: 'Create tenant' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Code/), 'ACME');
    await user.type(within(dialog).getByLabelText(/Name/), 'Acme Construction');
    await user.click(
      within(dialog).getByRole('button', { name: 'Create tenant' })
    );

    expect(api.createTenant).toHaveBeenCalledWith({
      code: 'ACME',
      name: 'Acme Construction',
      tier: 'starter',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.listTenantsPage).toHaveBeenCalledTimes(2); // initial load + reload after create
  });

  it('surfaces a server conflict unmodified, without a client-side uniqueness check (AC02)', async () => {
    api.listTenantsPage.mockResolvedValue(page([]));
    api.createTenant.mockRejectedValue(new ApiError('CONFLICT', 409));
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('No tenants yet.');

    await user.click(screen.getByRole('button', { name: 'Create tenant' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Code/), 'ACME');
    await user.type(within(dialog).getByLabelText(/Name/), 'Acme Construction');
    await user.click(
      within(dialog).getByRole('button', { name: 'Create tenant' })
    );

    expect(
      await within(dialog).findByText('A tenant with this code already exists.')
    ).toBeTruthy();
    expect(screen.getByRole('dialog')).toBeTruthy(); // dialog stays open
  });
});
