/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints.js';
import { ApiError } from '../../src/api/client.js';
import { useSession } from '../../src/auth/SessionContext.jsx';
import { TenantsPage } from '../../src/pages/management/TenantsPage.jsx';
import { ContextualActionHeader } from '../../src/shell/ContextualActionHeader.jsx';
import { NoticeProvider } from '../../src/shell/NoticeContext.jsx';
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
  listCellsOverview: vi.fn(async () => ({ rows: [], nextCursor: null })),
  provisionTenant: vi.fn(),
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
      <NoticeProvider>
        <PageHeaderProvider>
          <ContextualActionHeader />
          <TenantsPage />
        </PageHeaderProvider>
      </NoticeProvider>
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

  it('offers Retry only for a failed job, and shows its failure in the detail (I0006-R012, R020, R021)', async () => {
    api.listTenantsPage.mockResolvedValue(
      page([{ ...TENANT, cellId: 'c1', job: failedJob }])
    );
    api.listCellsOverview.mockResolvedValue({
      rows: [{ cell: { id: 'c1', database_name: 'nap_dev_cell_a' } }],
      nextCursor: null,
    });
    api.retryTenantProvisioning.mockResolvedValue({});
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'ACME' }));
    const detail = await screen.findByRole('dialog', {
      name: 'Acme Construction (ACME)',
    });
    expect(within(detail).getByText('SEED_FAILED')).toBeTruthy();
    expect(within(detail).getByText('Roles ready')).toBeTruthy();
    expect(await within(detail).findByText('nap_dev_cell_a')).toBeTruthy();
    await user.click(within(detail).getByRole('button', { name: 'Retry' }));
    expect(api.retryTenantProvisioning).toHaveBeenCalledWith({ tenant: 't1' });
    expect(await screen.findByText('Retry queued for ACME.')).toBeTruthy();

    await user.click(screen.getByRole('menuitem', { name: 'more' }));
    expect(await screen.findByRole('menuitem', { name: 'Retry' })).toBeTruthy();
  });

  it("finds the tenant's cell name past the first page of cells", async () => {
    api.listTenantsPage.mockResolvedValue(
      page([{ ...TENANT, cellId: 'c2', job: null }])
    );
    api.listCellsOverview
      .mockResolvedValueOnce({
        rows: [{ cell: { id: 'c1', database_name: 'nap_dev_cell_a' } }],
        nextCursor: 'next',
      })
      .mockResolvedValueOnce({
        rows: [{ cell: { id: 'c2', database_name: 'nap_dev_cell_b' } }],
        nextCursor: null,
      });
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'ACME' }));
    const detail = await screen.findByRole('dialog');
    expect(await within(detail).findByText('nap_dev_cell_b')).toBeTruthy();
    expect(api.listCellsOverview).toHaveBeenLastCalledWith({
      cursor: 'next',
      limit: 100,
    });
  });

  it('shows only Code, Name, and Status in the grid (I0006-R020)', async () => {
    api.listTenantsPage.mockResolvedValue(page([TENANT]));
    renderPage();
    await screen.findByText('Acme Construction');
    const headers = screen
      .getAllByRole('columnheader')
      .map(header => header.textContent)
      .filter(Boolean);
    expect(headers).toEqual(['Code', 'Name', 'Status']);
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
        .mockResolvedValue(
          page([{ ...TENANT, status: 'active', job: done }], false)
        );
      renderPage();
      await screen.findByText('pending');
      await vi.advanceTimersByTimeAsync(2000);
      await screen.findByText('active');
      const calls = api.listTenantsPage.mock.calls.length;
      await vi.advanceTimersByTimeAsync(6000);
      expect(api.listTenantsPage).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  describe('Provision tenant (I0013-R001, R005)', () => {
    beforeEach(() => {
      api.listTenantsPage.mockResolvedValue(page([]));
      api.listCellsOverview.mockResolvedValue({
        rows: [
          { cell: { id: 'c1', database_name: 'nap_dev_cell_a' }, ready: true },
        ],
        nextCursor: null,
      });
    });

    async function fill(user) {
      await user.click(
        await screen.findByRole('button', { name: 'Provision tenant' })
      );
      const form = await screen.findByRole('dialog', {
        name: 'Provision tenant',
      });
      await user.type(
        within(form).getByLabelText(/^Legal name/),
        'Oak Homes LLC'
      );
      await user.type(within(form).getByLabelText(/^DBA name/), 'Oak Homes');
      await user.type(within(form).getByLabelText(/^Code/), 'oak');
      await user.type(within(form).getByLabelText(/^First name/), 'Ann');
      await user.type(within(form).getByLabelText(/^Last name/), 'Admin');
      await user.type(
        within(form).getByLabelText(/Administrator email/),
        'ann@oak.test'
      );
      await user.type(
        within(form).getByLabelText(/Administrator phone/),
        '(512) 555-0100'
      );
      await user.type(
        within(form).getByLabelText(/Temporary password/),
        'temporary'
      );
      await user.click(within(form).getByRole('button', { name: 'Provision' }));
      return form;
    }

    it('collects the names, code, cell, and administrator with a phone', async () => {
      api.provisionTenant.mockResolvedValue({});
      renderPage();
      await fill(userEvent.setup());
      expect(api.provisionTenant).toHaveBeenCalledWith({
        legalName: 'Oak Homes LLC',
        dbaName: 'Oak Homes',
        code: 'oak',
        tier: 'starter',
        cell: 'c1',
        firstName: 'Ann',
        lastName: 'Admin',
        email: 'ann@oak.test',
        // Read in Napsoft's default country (the US outside a provider).
        phone: '+15125550100',
        password: 'temporary',
      });
    });

    it.each([
      ['CONFLICT', { field: 'code' }, 'Another tenant uses this code.'],
      [
        'CONFLICT',
        { field: 'email' },
        'This email belongs to a login that cannot be used.',
      ],
      [
        'INVALID_INPUT',
        { field: 'phone' },
        'Enter a valid phone number for the administrator.',
      ],
    ])('names the problem for %s %o', async (code, details, message) => {
      api.provisionTenant.mockRejectedValue(
        new ApiError(code, 409, null, { details })
      );
      renderPage();
      const form = await fill(userEvent.setup());
      expect(await within(form).findByText(message)).toBeTruthy();
    });
  });
});
