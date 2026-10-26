/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client.js';
import * as api from '../../src/api/endpoints.js';
import { useSession } from '../../src/auth/SessionContext.jsx';
import { PortalUsersPage } from '../../src/pages/management/PortalUsersPage.jsx';
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
  listUsersPage: vi.fn(),
  listTenantsPage: vi.fn(),
  bulkPortalUserAction: vi.fn(),
  createPortalUser: vi.fn(),
  deactivatePortalUser: vi.fn(),
  restorePortalUser: vi.fn(),
  listUserMemberships: vi.fn(),
  resetUserPassword: vi.fn(),
  unlockUser: vi.fn(),
  setUserStatus: vi.fn(),
}));

vi.mock('../../src/auth/SessionContext.jsx', () => ({
  useSession: vi.fn(),
}));

const ACTIVE_USER = {
  id: 'u1',
  email: 'a@example.com',
  status: 'active',
  mustChangePassword: true,
  deactivatedAt: null,
};

const ARCHIVED_USER = {
  ...ACTIVE_USER,
  id: 'u2',
  email: 'b@example.com',
  status: 'disabled',
  // A real `Date` object, matching what `listUsersPage()` produces after
  // parsing the server's ISO string through `usersListResponseSchema`'s
  // `z.coerce.date()` — the grid's `dateTime` column type requires this.
  deactivatedAt: new Date('2026-01-01T00:00:00Z'),
};

function renderPage(entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ThemeModeProvider>
        <NoticeProvider>
          <PageHeaderProvider>
            <ContextualActionHeader />
            <PortalUsersPage />
          </PageHeaderProvider>
        </NoticeProvider>
      </ThemeModeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  installMatchMedia();
  installResizeObserver();
  api.listTenantsPage.mockResolvedValue({
    rows: [{ id: 't-acme', code: 'ACME', name: 'Acme' }],
    nextCursor: null,
  });
  useSession.mockReturnValue({
    capabilities: capabilitiesFixture(),
    refreshCapabilities: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PortalUsersPage', () => {
  const OTHER = { ...ACTIVE_USER, id: 'u3', email: 'c@example.com' };

  it('deactivates the selected users in one request from the header (I0002-R014)', async () => {
    api.listUsersPage.mockResolvedValue({
      rows: [ACTIVE_USER, OTHER],
      nextCursor: null,
    });
    api.bulkPortalUserAction.mockResolvedValue(undefined);
    renderPage();
    await screen.findByText('c@example.com');
    const user = userEvent.setup();
    const boxes = screen.getAllByRole('checkbox', { name: /select row/i });
    await user.click(boxes[0]);
    await user.click(boxes[1]);
    await user.click(
      screen.getByRole('button', { name: 'Deactivate selected (2)' })
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Deactivate selected',
    });
    expect(
      within(dialog).getByText(
        '2 users will be deactivated. Deactivated users are signed out and cannot sign in until restored.'
      )
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole('button', { name: 'Deactivate' })
    );
    expect(api.bulkPortalUserAction).toHaveBeenCalledWith('archive', [
      'u1',
      'u3',
    ]);
    expect(await screen.findByText('2 users deactivated.')).toBeTruthy();
  });

  it('lists each user a bulk deactivate refused, by email', async () => {
    api.listUsersPage.mockResolvedValue({
      rows: [ACTIVE_USER, OTHER],
      nextCursor: null,
    });
    api.bulkPortalUserAction.mockRejectedValue(
      new ApiError('BULK_FAILED', 409, null, {
        details: [{ id: 'u3', code: 'ROOT_IMMUTABLE' }],
      })
    );
    renderPage();
    await screen.findByText('c@example.com');
    const user = userEvent.setup();
    for (const box of screen.getAllByRole('checkbox', { name: /select row/i }))
      await user.click(box);
    await user.click(
      screen.getByRole('button', { name: 'Deactivate selected (2)' })
    );
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'Deactivate selected' })
      ).getByRole('button', { name: 'Deactivate' })
    );
    const failure = await screen.findByRole('dialog', {
      name: 'Nothing was changed',
    });
    expect(
      within(failure).getByText(
        'c@example.com: The initial Napsoft user cannot be changed.'
      )
    ).toBeTruthy();
  });

  it('filters by tenant, status, and must-change-password, with chips and Clear all (I0002-R016)', async () => {
    api.listUsersPage.mockResolvedValue({
      rows: [ACTIVE_USER],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText('a@example.com');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    const panel = screen.getByRole('dialog', { name: 'Filters' });
    expect(
      within(panel).queryByRole('button', { name: 'Clear all' })
    ).toBeNull();

    await user.click(within(panel).getByLabelText('Tenant'));
    await user.click(
      await screen.findByRole('option', { name: 'ACME — Acme' })
    );
    await user.click(within(panel).getByLabelText('Status'));
    await user.click(await screen.findByRole('option', { name: 'Disabled' }));
    await user.click(within(panel).getByLabelText('Must change password'));
    await user.click(await screen.findByRole('option', { name: 'Yes' }));
    await vi.waitFor(() =>
      expect(api.listUsersPage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          tenantId: 't-acme',
          status: 'disabled',
          mustChangePassword: 'true',
        })
      )
    );
    const chips = screen.getByLabelText('Active filters');
    for (const label of [
      'Tenant: ACME',
      'Status: Disabled',
      'Must change password: Yes',
    ])
      expect(within(chips).getByText(label)).toBeTruthy();

    await user.click(within(panel).getByRole('button', { name: 'Clear all' }));
    await vi.waitFor(() =>
      expect(api.listUsersPage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          tenantId: undefined,
          status: undefined,
          mustChangePassword: undefined,
        })
      )
    );
    expect(screen.queryByLabelText('Active filters')).toBeNull();
  });

  it('searches by email from the header (I0002-R015)', async () => {
    api.listUsersPage.mockResolvedValue({
      rows: [ACTIVE_USER],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText('a@example.com');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search by email'), '  A@ex ');
    await vi.waitFor(() =>
      expect(api.listUsersPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ email: 'A@ex', archived: false })
      )
    );
  });

  it('offers only Restore selected in the Archived view, with no create action (I0011-R005)', async () => {
    api.listUsersPage.mockResolvedValue({
      rows: [ARCHIVED_USER],
      nextCursor: null,
    });
    renderPage('/?view=archived');
    await screen.findByText('b@example.com');
    expect(
      screen.queryByRole('button', { name: 'Create portal user' })
    ).toBeNull();
    const user = userEvent.setup();
    await user.click(
      screen.getAllByRole('checkbox', { name: /select row/i })[0]
    );
    expect(
      screen.getByRole('button', { name: 'Restore selected (1)' })
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Deactivate selected/ })
    ).toBeNull();
  });

  it('lists portal-user accounts (loading -> populated, I0001-R021)', async () => {
    api.listUsersPage.mockResolvedValue({
      rows: [ACTIVE_USER],
      nextCursor: null,
    });
    renderPage();
    expect(await screen.findByText('a@example.com')).toBeTruthy();
  });

  it('shows an explicit empty state', async () => {
    api.listUsersPage.mockResolvedValue({ rows: [], nextCursor: null });
    renderPage();
    expect(await screen.findByText('No portal users yet.')).toBeTruthy();
  });

  it('shows a retryable error state', async () => {
    api.listUsersPage.mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByText('Could not load data.')).toBeTruthy();
  });

  it('offers only Deactivate for an active account, requiring confirmation (AC06)', async () => {
    api.listUsersPage.mockResolvedValue({
      rows: [ACTIVE_USER],
      nextCursor: null,
    });
    api.deactivatePortalUser.mockResolvedValue();
    renderPage();
    await screen.findByText('a@example.com');
    const user = userEvent.setup();
    await user.click(screen.getByRole('menuitem', { name: 'more' }));
    expect(screen.queryByRole('menuitem', { name: 'Restore' })).toBeNull();
    await user.click(
      await screen.findByRole('menuitem', { name: 'Deactivate' })
    );

    const dialog = await screen.findByRole('dialog');
    expect(api.deactivatePortalUser).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole('button', { name: 'Deactivate' })
    );
    expect(api.deactivatePortalUser).toHaveBeenCalledWith('u1');
  });

  it('lists deactivated users only in the Archived tab, untagged (I0011-R001, R004)', async () => {
    api.listUsersPage.mockImplementation(async ({ archived }) => ({
      rows: archived ? [ARCHIVED_USER] : [ACTIVE_USER],
      nextCursor: null,
    }));
    renderPage();
    await screen.findByText('a@example.com');
    expect(api.listUsersPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ archived: false })
    );
    expect(screen.queryByText('b@example.com')).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.queryByLabelText('Include archived')).toBeNull();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('tab', { name: 'Archived' }));
    const row = (await screen.findByText('b@example.com')).closest(
      '[role="row"]'
    );
    expect(within(row).queryByText('Archived')).toBeNull();
    expect(screen.queryByText('a@example.com')).toBeNull();
    expect(api.listUsersPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ archived: true })
    );
  });

  it('offers only Restore for an archived account, firing without confirmation (AC06)', async () => {
    api.listUsersPage.mockResolvedValue({
      rows: [ARCHIVED_USER],
      nextCursor: null,
    });
    api.restorePortalUser.mockResolvedValue({});
    renderPage();
    await screen.findByText('b@example.com');
    const user = userEvent.setup();
    await user.click(screen.getByRole('menuitem', { name: 'more' }));
    expect(screen.queryByRole('menuitem', { name: 'Deactivate' })).toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: 'Restore' }));

    expect(api.restorePortalUser).toHaveBeenCalledWith('u2');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('creates a portal user with an idempotency key and reloads the grid', async () => {
    api.listUsersPage.mockResolvedValue({ rows: [], nextCursor: null });
    api.createPortalUser.mockResolvedValue(ACTIVE_USER);
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('No portal users yet.');

    await user.click(
      screen.getByRole('button', { name: 'Create portal user' })
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Email/), 'a@example.com');
    await user.type(
      within(dialog).getByLabelText(/Temporary password/),
      'a-temp-password'
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create portal user' })
    );

    expect(api.createPortalUser).toHaveBeenCalledWith({
      email: 'a@example.com',
      password: 'a-temp-password',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.listUsersPage).toHaveBeenCalledTimes(2);
  });

  it('surfaces a server conflict from Create unmodified', async () => {
    api.listUsersPage.mockResolvedValue({ rows: [], nextCursor: null });
    api.createPortalUser.mockRejectedValue(new ApiError('CONFLICT', 409));
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('No portal users yet.');

    await user.click(
      screen.getByRole('button', { name: 'Create portal user' })
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Email/), 'a@example.com');
    await user.type(
      within(dialog).getByLabelText(/Temporary password/),
      'a-temp-password'
    );
    await user.click(
      within(dialog).getByRole('button', { name: 'Create portal user' })
    );

    expect(
      await within(dialog).findByText(
        'This email is already in use by another account.'
      )
    ).toBeTruthy();
  });

  it('shows no membership data on the grid, per I0002-R005', async () => {
    api.listUsersPage.mockResolvedValue({
      rows: [ACTIVE_USER],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText('a@example.com');
    expect(screen.queryByText(/membership/i)).toBeNull();
  });

  describe('login recovery (I0008)', () => {
    beforeEach(() => {
      api.listUsersPage.mockResolvedValue({
        rows: [ACTIVE_USER],
        nextCursor: null,
      });
    });

    async function openAction(name) {
      renderPage();
      await screen.findByText('a@example.com');
      const user = userEvent.setup();
      await user.click(screen.getByRole('menuitem', { name: 'more' }));
      await user.click(await screen.findByRole('menuitem', { name }));
      return user;
    }

    it("shows a login's memberships, one row per party (I0012-R020)", async () => {
      api.listUserMemberships.mockResolvedValue([
        {
          id: 'm1',
          tenantId: 't1',
          tenantCode: 'ACME',
          tenantName: 'Acme',
          memberType: 'employee',
          label: 'Employee',
          status: 'pending',
        },
        {
          id: 'm2',
          tenantId: 't1',
          tenantCode: 'ACME',
          tenantName: 'Acme',
          memberType: 'vendor_contact',
          label: 'Vendor · Black Plumbing',
          status: 'active',
        },
      ]);
      await openAction('Memberships');
      const dialog = await screen.findByRole('dialog', {
        name: 'Memberships of a@example.com',
      });
      expect(await within(dialog).findAllByText('Acme (ACME)')).toHaveLength(2);
      expect(within(dialog).getByText('Vendor · Black Plumbing')).toBeTruthy();
      expect(within(dialog).getByText('pending')).toBeTruthy();
      expect(api.listUserMemberships).toHaveBeenCalledWith('u1');
    });

    it('resets a password with a temporary one', async () => {
      api.resetUserPassword.mockResolvedValue(ACTIVE_USER);
      const user = await openAction('Reset password');
      const dialog = await screen.findByRole('dialog', {
        name: 'Reset password',
      });
      await user.type(
        within(dialog).getByLabelText(/Temporary password/),
        'temp-pass'
      );
      await user.click(
        within(dialog).getByRole('button', { name: 'Reset password' })
      );
      expect(api.resetUserPassword).toHaveBeenCalledWith('u1', 'temp-pass');
    });

    it('unlocks and disables a login', async () => {
      api.unlockUser.mockResolvedValue(ACTIVE_USER);
      api.setUserStatus.mockResolvedValue(ACTIVE_USER);
      await openAction('Unlock');
      expect(api.unlockUser).toHaveBeenCalledWith('u1');
      cleanup();
      await openAction('Disable');
      expect(api.setUserStatus).toHaveBeenCalledWith('u1', 'disabled');
    });

    it('explains a refusal on the initial Napsoft login', async () => {
      api.unlockUser.mockRejectedValue(new ApiError('ROOT_IMMUTABLE', 409));
      await openAction('Unlock');
      expect(
        await screen.findByText('The initial Napsoft user cannot be changed.')
      ).toBeTruthy();
    });
  });
});
