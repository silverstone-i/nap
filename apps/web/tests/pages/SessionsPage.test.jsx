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
import { NoticeProvider } from '../../src/shell/NoticeContext.jsx';
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
  browser: 'Chrome on macOS',
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
  browser: null,
  status: 'ended',
  endedAt: new Date('2026-10-09T10:00:00Z'),
};

function renderPage() {
  return render(
    <ThemeModeProvider>
      <NoticeProvider>
        <PageHeaderProvider>
          <ContextualActionHeader />
          <SessionsPage />
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
    // I0009-R015: plain text, and no Ended column while the filter is Active.
    expect(within(grid).getByText('Active')).toBeTruthy();
    expect(within(grid).getByText('Ended')).toBeTruthy();
    expect(grid.querySelector('.MuiChip-root')).toBeNull();
    expect(
      within(grid).queryByRole('columnheader', { name: 'Ended' })
    ).toBeNull();
    expect(api.listSessionsPage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', limit: 25 })
    );
  });

  it('shows each browser after User and marks only this browser (M0001-14-R004, R005)', async () => {
    useSession.mockReturnValue({
      capabilities: capabilitiesFixture(),
      refreshCapabilities: vi.fn(),
      session: { id: ACTIVE.id },
    });
    renderPage();
    expect(await screen.findByText('ann@example.com')).toBeTruthy();
    const grid = screen.getByRole('grid');
    const headers = within(grid)
      .getAllByRole('columnheader')
      .map(header => header.textContent);
    expect(headers.indexOf('Browser')).toBe(headers.indexOf('User') + 1);
    const [ann, bob] = within(grid)
      .getAllByRole('row')
      .filter(row => /@example\.com/.test(row.textContent));
    expect(within(ann).getByText('Chrome on macOS')).toBeTruthy();
    expect(within(ann).getByRole('img', { name: 'This browser' })).toBeTruthy();
    expect(within(bob).getByText('—')).toBeTruthy();
    expect(within(bob).queryByRole('img', { name: 'This browser' })).toBeNull();
  });

  it('sends the email, tenant, date range, and status filters (R002, R006)', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText('ann@example.com');

    await user.type(screen.getByLabelText('Search by email'), 'ann');
    await waitFor(() =>
      expect(api.listSessionsPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ email: 'ann', status: 'active' })
      )
    );

    // The other filters are in the header's filter popover (I0001-R029).
    await user.click(screen.getByRole('button', { name: 'Filters' }));
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

    // Each filter away from its default shows as a removable chip.
    await user.keyboard('{Escape}');
    const chips = screen.getByLabelText('Active filters');
    expect(within(chips).getByText('Status: All')).toBeTruthy();
    expect(within(chips).getByText('Tenant: ACME')).toBeTruthy();
    await user.click(
      within(
        within(chips).getByText('Status: All').closest('.MuiChip-root')
      ).getByTestId('CancelIcon')
    );
    await waitFor(() =>
      expect(api.listSessionsPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'active' })
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
    const dialog = await screen.findByRole('dialog', {
      name: 'Revoke 2 sessions?',
    });
    expect(
      within(dialog).getByText('These users are signed out of these sessions.')
    ).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Revoke' }));
    expect(api.revokeSessions).toHaveBeenCalledWith(['s1', 's2']);
    // I0009-R017
    expect(await screen.findByText('2 sessions revoked.')).toBeTruthy();
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
    // I0001-R026: no multi-row action, so no checkbox column.
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.queryByLabelText('Tenant')).toBeNull();
  });
});
