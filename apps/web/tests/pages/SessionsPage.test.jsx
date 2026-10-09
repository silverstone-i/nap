/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints.js';
import { useSession } from '../../src/auth/SessionContext.jsx';
import { SessionsPage } from '../../src/pages/management/SessionsPage.jsx';
import { ContextualActionHeader } from '../../src/shell/ContextualActionHeader.jsx';
import { PageHeaderProvider } from '../../src/shell/PageHeaderContext.jsx';
import { ThemeModeProvider } from '../../src/theme/ThemeModeContext.jsx';
import {
  capabilitiesFixture,
  installMatchMedia,
  installResizeObserver,
} from '../testUtils.jsx';

vi.mock('../../src/api/endpoints.js', () => ({
  listSessionsPage: vi.fn(),
  listTenantsPage: vi.fn(),
  revokeSessions: vi.fn(),
}));

vi.mock('../../src/auth/SessionContext.jsx', () => ({
  useSession: vi.fn(),
}));

const ACME = { id: '11111111-1111-4111-8111-111111111111', code: 'ACME' };

const ACTIVE = {
  id: 's1',
  userId: 'u1',
  email: 'ann@example.com',
  tenant: { id: ACME.id, code: 'ACME', name: 'Acme' },
  startedAt: new Date('2026-10-09T08:00:00Z'),
  lastSeenAt: new Date('2026-10-09T09:00:00Z'),
  status: 'active',
  endedAt: null,
};

const ENDED = {
  ...ACTIVE,
  id: 's2',
  email: 'bob@example.com',
  tenant: null,
  status: 'ended',
  endedAt: new Date('2026-10-09T10:00:00Z'),
};

function renderPage() {
  return render(
    <ThemeModeProvider>
      <PageHeaderProvider>
        <ContextualActionHeader />
        <SessionsPage />
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
  api.listSessionsPage.mockResolvedValue({
    rows: [ACTIVE, ENDED],
    nextCursor: null,
  });
  api.listTenantsPage.mockResolvedValue({
    rows: [{ id: ACME.id, code: 'ACME', name: 'Acme' }],
    nextCursor: null,
    anyActive: false,
  });
  api.revokeSessions.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SessionsPage (I0009)', () => {
  it('lists active sessions by default with their status (R006)', async () => {
    renderPage();
    expect(await screen.findByText('ann@example.com')).toBeTruthy();
    const grid = screen.getByRole('grid');
    expect(within(grid).getByText('ACME')).toBeTruthy();
    const chip = { selector: '.MuiChip-label' };
    expect(within(grid).getByText('Active', chip)).toBeTruthy();
    expect(within(grid).getByText('Ended', chip)).toBeTruthy();
    expect(api.listSessionsPage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', limit: 25 })
    );
  });

  it('sends the email, tenant, date range, and status filters (R002, R006)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('ann@example.com');

    await user.type(screen.getByLabelText('User email'), 'ann{Enter}');
    await waitFor(() =>
      expect(api.listSessionsPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ email: 'ann', status: 'active' })
      )
    );

    await user.click(screen.getByLabelText('Status'));
    await user.click(await screen.findByRole('option', { name: 'All' }));
    await waitFor(() =>
      expect(api.listSessionsPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: undefined })
      )
    );

    await user.click(screen.getByLabelText('Tenant'));
    await user.click(
      await screen.findByRole('option', { name: 'ACME — Acme' })
    );
    await waitFor(() =>
      expect(api.listSessionsPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ tenantId: ACME.id })
      )
    );

    await user.type(screen.getByLabelText('From'), '2026-10-01');
    await user.type(screen.getByLabelText('To'), '2026-10-02');
    await waitFor(() =>
      expect(api.listSessionsPage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          from: new Date(2026, 9, 1, 0, 0, 0, 0).toISOString(),
          to: new Date(2026, 9, 2, 23, 59, 59, 999).toISOString(),
        })
      )
    );
  });

  it('offers Revoke only on active rows, with its confirmation text (R007, R012)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('ann@example.com');
    const menus = screen.getAllByRole('menuitem', { name: 'more' });
    expect(menus).toHaveLength(1);
    await user.click(menus[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Revoke' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('This user is signed out of this session.')
    ).toBeTruthy();
    expect(api.revokeSessions).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    expect(api.revokeSessions).toHaveBeenCalledWith(['s1']);
    await waitFor(() => expect(api.listSessionsPage).toHaveBeenCalledTimes(2));
  });

  it('revokes the selected sessions after one confirmation naming the count (R008)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('ann@example.com');
    expect(
      screen.queryByRole('button', { name: /Revoke selected/ })
    ).toBeNull();
    const boxes = screen.getAllByRole('checkbox', { name: /select row/i });
    await user.click(boxes[0]);
    await user.click(boxes[1]);
    await user.click(
      await screen.findByRole('button', { name: 'Revoke selected (2)' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText('2 sessions will be signed out.')
    ).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    expect(api.revokeSessions).toHaveBeenCalledWith(['s1', 's2']);
  });

  it('hides revoking without sessions::revoke', async () => {
    useSession.mockReturnValue({
      capabilities: capabilitiesFixture({
        patterns: ['NAP::admin-tenancy::sessions::read'],
      }),
      refreshCapabilities: vi.fn(),
    });
    renderPage();
    await screen.findByText('ann@example.com');
    expect(screen.queryAllByRole('menuitem', { name: 'more' })).toHaveLength(0);
    await userEvent
      .setup()
      .click(screen.getAllByRole('checkbox', { name: /select row/i })[0]);
    expect(
      screen.queryByRole('button', { name: /Revoke selected/ })
    ).toBeNull();
    expect(screen.queryByLabelText('Tenant')).toBeNull();
  });
});
