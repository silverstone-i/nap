/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/// <reference lib="es2024.promise" />
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from '../src/routes.js';
import { ThemeModeProvider } from '../src/theme/ThemeModeProvider.js';
import { safeNext } from '../src/auth/session.js';

const view = {
  actorId: '00000000-0000-4000-8000-000000000001',
  email: 'root@nap.test',
  tenantId: '00000000-0000-4000-8000-000000000002',
  tenantCode: 'NAP',
  expiresAt: '2099-01-01T00:00:00.000Z',
};
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
  fetchMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Does: Supplies a versioned JSON response to the browser API mock. */
function reply(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
/** Does: Builds a successful session response used by login and account tests. */
function sessionReply() {
  return reply({ version: 1, data: view });
}
/** Does: Builds the anonymous-session response used by route gates. */
function anonymous() {
  return reply(
    { version: 1, code: 'UNAUTHENTICATED', message: 'Authentication required' },
    401
  );
}
/** Does: Renders the production routes with isolated navigation state. */
function mount(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ThemeModeProvider>
      <RouterProvider router={router} />
    </ThemeModeProvider>
  );
  return router;
}
/** Does: Fills and submits the login form after session lookup completes. */
async function submitLogin() {
  fireEvent.change(await screen.findByLabelText('Email', { exact: false }), {
    target: { value: 'root@nap.test' },
  });
  fireEvent.change(screen.getByLabelText('Password', { exact: false }), {
    target: { value: 'a-long-test-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

it('redirects anonymous account visits and renders login', async () => {
  fetchMock.mockResolvedValue(anonymous());
  const router = mount('/account');
  await screen.findByRole('button', { name: 'Sign in' });
  expect(router.state.location.pathname + router.state.location.search).toBe(
    '/login?next=%2Faccount'
  );
});

it('redirects signed-in login visits to account and displays identity and tenant', async () => {
  fetchMock.mockResolvedValue(sessionReply());
  const router = mount('/login');
  await screen.findByText(view.email);
  expect(router.state.location.pathname).toBe('/account');
  expect(screen.getByText('Tenant: NAP')).toBeDefined();
});

it('shows session loading and allows retry after a network failure', async () => {
  const pending = Promise.withResolvers<Response>();
  fetchMock
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(anonymous());
  mount('/login');
  await screen.findByLabelText('Loading session');
  pending.reject(new Error('offline'));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByRole('button', { name: 'Sign in' });
});

it('shows wrong credentials and throttling, and disables duplicate submissions while loading', async () => {
  const pending = Promise.withResolvers<Response>();
  fetchMock
    .mockResolvedValueOnce(anonymous())
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce(
      reply(
        {
          version: 1,
          code: 'THROTTLED',
          message: 'Too many login attempts; try again later',
        },
        429
      )
    );
  mount('/login');
  await submitLogin();
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Signing in…' })
      .disabled
  ).toBe(true);
  pending.resolve(anonymous());
  await screen.findByText('Email or password could not be verified.');
  await submitLogin();
  await screen.findByText('Too many login attempts; try again later');
});

it('honors a safe next path after a successful login', async () => {
  fetchMock
    .mockResolvedValueOnce(anonymous())
    .mockResolvedValueOnce(sessionReply());
  const router = mount('/login?next=%2F');
  await submitLogin();
  await waitFor(() => expect(router.state.location.pathname).toBe('/'));
});

it.each([
  'https://evil.test',
  '//evil.test',
  '/\\evil.test',
  '/login',
  '/	/evil.test',
])('refuses unsafe next value %s', value => {
  expect(safeNext(value)).toBe('/account');
});

it('changes a password, shows success, and signs out', async () => {
  fetchMock
    .mockResolvedValueOnce(sessionReply())
    .mockResolvedValueOnce(reply({ version: 1, data: null }))
    .mockResolvedValueOnce(reply({ version: 1, data: null }));
  const router = mount('/account');
  fireEvent.change(
    await screen.findByLabelText('Current password', { exact: false }),
    { target: { value: 'a-long-test-password' } }
  );
  fireEvent.change(screen.getByLabelText('New password', { exact: false }), {
    target: { value: 'a-new-test-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  await screen.findByText(
    'Password changed. Other sessions have been signed out.'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
});

it('returns an expired session to login after a refused password change', async () => {
  fetchMock
    .mockResolvedValueOnce(sessionReply())
    .mockResolvedValueOnce(anonymous())
    .mockResolvedValueOnce(anonymous());
  const router = mount('/account');
  fireEvent.change(
    await screen.findByLabelText('Current password', { exact: false }),
    { target: { value: 'a-long-test-password' } }
  );
  fireEvent.change(screen.getByLabelText('New password', { exact: false }), {
    target: { value: 'a-new-test-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
});
