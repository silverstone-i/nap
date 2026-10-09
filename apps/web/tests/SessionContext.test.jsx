/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import { apiGet, setUnauthenticatedHandler } from '../src/api/client.js';
import * as api from '../src/api/endpoints.js';
import { SessionProvider, useSession } from '../src/auth/SessionContext.jsx';
import { capabilitiesFixture } from './testUtils.jsx';

vi.mock('../src/api/endpoints.js', () => ({
  getAccessContext: vi.fn(),
  getSessionCapabilities: vi.fn(),
  logout: vi.fn(),
  listTenants: vi.fn(),
  selectTenant: vi.fn(),
  login: vi.fn(),
  changePassword: vi.fn(),
}));

/**
 * Stand-in for `BroadcastChannel`: delivers a message to every other open
 * channel of the same name, as the browser does between tabs.
 */
class FakeChannel {
  static open = [];
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    this.sent = [];
    FakeChannel.open.push(this);
  }
  postMessage(data) {
    this.sent.push(data);
    for (const other of FakeChannel.open)
      if (other !== this && other.name === this.name)
        other.onmessage?.({ data });
  }
  close() {
    FakeChannel.open = FakeChannel.open.filter(channel => channel !== this);
  }
}

const CONTEXT = {
  session: { restricted: false },
  user: { id: 'u1', email: 'root@example.com' },
  selectedTenant: null,
  operator: { id: 't1', code: 'NAP', name: 'Napsoft', tier: 'starter' },
  entryPoints: { tenant: false },
};

/** One "tab": its own router and session provider, showing what a test reads. */
function Probe({ name }) {
  const session = useSession();
  const location = useLocation();
  return (
    <div data-testid={name}>
      <span>{`${name}:${session.status}:${location.pathname}:${session.notice ?? ''}`}</span>
      <button onClick={() => session.logout()}>{`${name} logout`}</button>
    </div>
  );
}

function Tab({ name, path = '/management/sessions' }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <SessionProvider>
        <Probe name={name} />
      </SessionProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  FakeChannel.open = [];
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  window.sessionStorage.clear();
  api.getAccessContext.mockResolvedValue(CONTEXT);
  api.getSessionCapabilities.mockResolvedValue(capabilitiesFixture());
  api.logout.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  setUnauthenticatedHandler(null);
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('same-browser reset (I0009-R013, R014)', () => {
  it('sends the other tab to /login with its return path and no request when one logs out', async () => {
    render(
      <>
        <Tab name="a" />
        <Tab name="b" path="/management/portal-users" />
      </>
    );
    await screen.findByText('a:ready:/management/sessions:');
    await screen.findByText('b:ready:/management/portal-users:');
    const requestsBefore =
      api.getAccessContext.mock.calls.length +
      api.getSessionCapabilities.mock.calls.length;

    await act(async () => screen.getByText('a logout').click());

    expect(await screen.findByText('a:anonymous:/login:')).toBeTruthy();
    expect(
      await screen.findByText('b:anonymous:/login:sessionEnded')
    ).toBeTruthy();
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(
      api.getAccessContext.mock.calls.length +
        api.getSessionCapabilities.mock.calls.length
    ).toBe(requestsBefore);
    expect(window.sessionStorage.getItem('nap.returnPath')).toBe(
      '/management/portal-users'
    );
    expect(FakeChannel.open.flatMap(channel => channel.sent)).toEqual([
      { type: 'ended' },
    ]);
  });

  it('ends the session and tells other tabs when a request fails UNAUTHENTICATED mid-use', async () => {
    render(<Tab name="a" />);
    await screen.findByText('a:ready:/management/sessions:');
    const otherTab = new FakeChannel('nap.session');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 401,
        headers: new Headers(),
        json: async () => ({
          version: 1,
          error: { code: 'UNAUTHENTICATED', message: 'x' },
        }),
      })
    );
    const received = [];
    otherTab.onmessage = event => received.push(event.data);

    await act(async () => {
      await apiGet('/api/admin-tenancy/v1/sessions').catch(() => {});
      await apiGet('/api/admin-tenancy/v1/tenants').catch(() => {});
    });

    expect(
      await screen.findByText('a:anonymous:/login:sessionEnded')
    ).toBeTruthy();
    expect(received).toEqual([{ type: 'ended' }]);
    expect(window.sessionStorage.getItem('nap.returnPath')).toBe(
      '/management/sessions'
    );
  });

  it('ignores UNAUTHENTICATED from the auth routes, where it means a wrong password', async () => {
    render(<Tab name="a" />);
    await screen.findByText('a:ready:/management/sessions:');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 401,
        headers: new Headers(),
        json: async () => ({
          version: 1,
          error: { code: 'UNAUTHENTICATED', message: 'x' },
        }),
      })
    );
    await act(async () => {
      await apiGet('/api/admin-tenancy/v1/auth/password').catch(() => {});
    });
    expect(screen.getByText('a:ready:/management/sessions:')).toBeTruthy();
  });
});
