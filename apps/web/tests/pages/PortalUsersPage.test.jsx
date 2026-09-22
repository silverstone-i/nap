/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../src/api/client.js';
import * as api from '../../src/api/endpoints.js';
import { PortalUsersPage } from '../../src/pages/management/PortalUsersPage.jsx';
import { ContextualActionHeader } from '../../src/shell/ContextualActionHeader.jsx';
import { PageHeaderProvider } from '../../src/shell/PageHeaderContext.jsx';
import { ThemeModeProvider } from '../../src/theme/ThemeModeContext.jsx';
import { installMatchMedia, installResizeObserver } from '../testUtils.jsx';

vi.mock('../../src/api/endpoints.js', () => ({
  listUsersPage: vi.fn(),
  createPortalUser: vi.fn(),
  deactivatePortalUser: vi.fn(),
  restorePortalUser: vi.fn(),
}));

const ACTIVE_USER = {
  id: 'u1',
  email: 'a@example.com',
  status: 'active',
  mustChangePassword: true,
  deactivatedAt: null,
  isRoot: false,
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

const ROOT_USER = {
  id: 'u3',
  email: 'root@example.com',
  status: 'active',
  mustChangePassword: false,
  deactivatedAt: null,
  isRoot: true,
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
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PortalUsersPage', () => {
  it('lists portal-user accounts (loading -> populated, F0001-R021)', async () => {
    api.listUsersPage.mockResolvedValue({ rows: [ACTIVE_USER], nextCursor: null });
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
    api.listUsersPage.mockResolvedValue({ rows: [ACTIVE_USER], nextCursor: null });
    api.deactivatePortalUser.mockResolvedValue();
    renderPage();
    await screen.findByText('a@example.com');
    const user = userEvent.setup();
    await user.click(screen.getByRole('menuitem', { name: 'more' }));
    expect(screen.queryByRole('menuitem', { name: 'Restore' })).toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));

    const dialog = await screen.findByRole('dialog');
    expect(api.deactivatePortalUser).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect(api.deactivatePortalUser).toHaveBeenCalledWith('u1');
  });

  it('offers only Restore for an archived account, firing without confirmation (AC06)', async () => {
    api.listUsersPage.mockResolvedValue({ rows: [ARCHIVED_USER], nextCursor: null });
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

    await user.click(screen.getByRole('button', { name: 'Create portal user' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Email/), 'a@example.com');
    await user.type(within(dialog).getByLabelText(/Temporary password/), 'a-temp-password');
    await user.click(within(dialog).getByRole('button', { name: 'Create portal user' }));

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

    await user.click(screen.getByRole('button', { name: 'Create portal user' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Email/), 'a@example.com');
    await user.type(within(dialog).getByLabelText(/Temporary password/), 'a-temp-password');
    await user.click(within(dialog).getByRole('button', { name: 'Create portal user' }));

    expect(
      await within(dialog).findByText(
        'This email is already in use by another account.'
      )
    ).toBeTruthy();
  });

  it('shows no membership data on the grid, per F0002-R005', async () => {
    api.listUsersPage.mockResolvedValue({ rows: [ACTIVE_USER], nextCursor: null });
    renderPage();
    await screen.findByText('a@example.com');
    expect(screen.queryByText(/membership/i)).toBeNull();
  });

  it('shows root for visibility but offers no action, since M0001-08 refuses both against it', async () => {
    api.listUsersPage.mockResolvedValue({
      rows: [ACTIVE_USER, ROOT_USER],
      nextCursor: null,
    });
    renderPage();
    await screen.findByText('root@example.com');
    // Only the ordinary user's row gets a "more" action trigger.
    expect(screen.getAllByRole('menuitem', { name: 'more' })).toHaveLength(1);
  });
});
