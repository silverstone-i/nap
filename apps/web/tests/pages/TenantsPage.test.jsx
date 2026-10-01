/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints.js';
import { useSession } from '../../src/auth/SessionContext.jsx';
import { TenantsPage } from '../../src/pages/management/TenantsPage.jsx';
import { ContextualActionHeader } from '../../src/shell/ContextualActionHeader.jsx';
import { PageHeaderProvider } from '../../src/shell/PageHeaderContext.jsx';
import { ThemeModeProvider } from '../../src/theme/ThemeModeContext.jsx';
import {
  NAPSOFT_TENANT,
  capabilitiesFixture,
  installMatchMedia,
  installResizeObserver,
} from '../testUtils.jsx';

const navigate = vi.fn();
vi.mock('react-router', async importOriginal => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

vi.mock('../../src/api/endpoints.js', () => ({
  listTenantsPage: vi.fn(),
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
  clientId: null,
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
// button to appear in the DOM.
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
    selectedTenant: NAPSOFT_TENANT,
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

  it("offers View client, opening the tenant's Napsoft client record (I0006-R010)", async () => {
    api.listTenantsPage.mockResolvedValue(
      page([{ ...TENANT, clientId: 'client-1' }])
    );
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('ACME');
    expect(screen.queryByRole('button', { name: 'Create tenant' })).toBeNull();

    await user.click(screen.getByRole('menuitem', { name: 'more' }));
    expect(screen.queryByRole('menuitem', { name: 'Provision' })).toBeNull();
    await user.click(
      await screen.findByRole('menuitem', { name: 'View client' })
    );
    expect(navigate).toHaveBeenCalledWith('/directory/clients?open=client-1');
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
});
