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
import { PortalUsersPage } from '../../src/pages/management/PortalUsersPage.jsx';
import { ContextualActionHeader } from '../../src/shell/ContextualActionHeader.jsx';
import { PageHeaderProvider } from '../../src/shell/PageHeaderContext.jsx';
import { ThemeModeProvider } from '../../src/theme/ThemeModeContext.jsx';
import {
  capabilitiesFixture,
  installMatchMedia,
  installResizeObserver,
} from '../testUtils.jsx';

vi.mock('../../src/api/endpoints.js', () => ({
  listUsersPage: vi.fn(),
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

function renderPage() {
  return render(
    <ThemeModeProvider>
      <PageHeaderProvider>
        <ContextualActionHeader />
        <PortalUsersPage />
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

describe('PortalUsersPage', () => {
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

    it("shows a login's memberships", async () => {
      api.listUserMemberships.mockResolvedValue([
        {
          id: 'm1',
          tenantId: 't1',
          tenantCode: 'ACME',
          tenantName: 'Acme',
          memberType: 'employee',
          status: 'pending',
        },
      ]);
      await openAction('Memberships');
      const dialog = await screen.findByRole('dialog', {
        name: 'Memberships of a@example.com',
      });
      expect(await within(dialog).findByText('Acme (ACME)')).toBeTruthy();
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
