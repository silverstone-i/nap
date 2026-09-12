/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
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
import { invalidateRequests } from '../src/api/lifecycle.js';
import { command } from '../src/api/control.js';

const tenant = '00000000-0000-4000-8000-000000000001';
const cell = '00000000-0000-4000-8000-000000000002';
const member = '00000000-0000-4000-8000-000000000003';
const jobId = '00000000-0000-4000-8000-000000000004';
const actor = '00000000-0000-4000-8000-000000000005';
const fetchMock =
  vi.fn<
    (
      url: string,
      init?: { body?: string; method?: string }
    ) => Promise<Response>
  >();
/**
 * Does: Wraps fixture data in the API response envelope.
 * Called by: the request stubs in this suite.
 */
function reply(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ version: 1, data }), { status: 200 })
  );
}
/**
 * Does: Supplies tenant provisioning records and operator session data.
 * Called by: each workflow test before mounting production routes.
 */
function fixture(stage = 'pending', ready = false) {
  const data = {
    cells: [{ id: cell, code: 'cell-1', name: 'First cell', enabled: true }],
    tenants: [
      {
        id: tenant,
        tenant_code: 'TEST',
        company: 'Test tenant',
        tier: 'starter',
        status: 'pending',
        cell_id: cell,
        provisioned: false,
      },
    ],
    users: [{ id: actor, email: 'employee@nap.test', status: 'active' }],
    members: [
      {
        id: member,
        portal_user_id: actor,
        tenant_id: tenant,
        status: 'active',
        user_type: 'employee',
        ready,
        entity_id: actor,
      },
    ],
    jobs: [
      {
        id: jobId,
        tenant_id: tenant,
        membership_id: member,
        record_id: actor,
        kind: 'employee',
        stage,
        failure_code: stage === 'failed' ? 'CELL_SYNC_FAILED' : null,
      },
    ],
    grants: [],
  };
  fetchMock.mockImplementation((url, init) => {
    const path = url;
    if (path.endsWith('/session'))
      return reply({
        actorId: actor,
        email: 'operator@nap.test',
        tenantId: null,
        tenantCode: null,
        state: 'tenant-selection-required',
        platformPermissions: [
          'overview',
          'registry',
          'members',
          'provision',
        ].map(p => `admin-tenancy::control::${p}`),
        controlledAccess: null,
        expiresAt: '2099-01-01T00:00:00Z',
      });
    if (path.endsWith('/overview')) return reply(data);
    if (init?.method === 'POST') return reply({ jobId });
    throw new Error(`Unexpected fixture request: ${path}`);
  });
  return data;
}
/**
 * Does: Renders a workflow in the real shell and theme.
 * Called by: UI acceptance tests.
 */
function mount(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ThemeModeProvider>
      <RouterProvider router={router} />
    </ThemeModeProvider>
  );
  return router;
}
beforeEach(() => {
  invalidateRequests();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('blocks tenant creation from an empty or disabled registry and links to cell setup', async () => {
  const data = fixture();
  data.cells[0].enabled = false;
  mount('/management/tenants/new');
  // Initial lazy route imports can exceed the default one-second wait on CI.
  await screen.findByText(
    /No enabled cells are available/,
    {},
    { timeout: 5000 }
  );
  expect(
    screen.getByRole('link', { name: 'Go to Cells' }).getAttribute('href')
  ).toBe('/management/cells');
  expect(
    screen
      .getByRole('button', { name: 'Create pending tenant' })
      .hasAttribute('disabled')
  ).toBe(true);
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Assigned cell' }));
  expect(screen.queryByRole('option', { name: 'First cell' })).toBeNull();
});

it('retains the durable job ID when the initial synchronization loses its response', async () => {
  fetchMock.mockImplementation(url =>
    url.endsWith('/members')
      ? reply({ jobId })
      : Promise.reject(new Error('offline'))
  );
  const result = await command({
    operation: 'member',
    target: tenant,
    kind: 'employee',
    name: 'Employee',
    email: 'employee@nap.test',
  });
  expect(result.ok).toBe(false);
  expect(result.jobId).toBe(jobId);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('shows durable failure after successful commands and retries the same job without a name', async () => {
  fixture('failed');
  mount(`/management/tenants/${tenant}`);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry provisioning' })
  );
  fireEvent.mouseDown(
    screen.getByRole('combobox', { name: 'Provisioning job' })
  );
  fireEvent.click(
    await screen.findByRole('option', { name: /employee — failed/ })
  );
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Retry provisioning' })[1]
  );
  await screen.findByText(/Provisioning failed.*Retry the existing job/);
  const posts = fetchMock.mock.calls.filter(
    ([, init]) => init?.method === 'POST'
  );
  expect(posts).toHaveLength(1);
  expect(JSON.parse(String(posts[0]?.[1]?.body))).toEqual({
    operation: 'retry',
    job: jobId,
  });
});

it('keeps a created membership out of the creation form after interrupted synchronization', async () => {
  fixture();
  const fallback = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url, init) =>
    url.endsWith('/provision')
      ? Promise.reject(new Error('offline'))
      : fallback(url, init)
  );
  const router = mount(`/management/portal-users/new?target=${tenant}`);
  fireEvent.change(
    await screen.findByLabelText('Employee or contact name', { exact: false }),
    { target: { value: 'Employee' } }
  );
  fireEvent.change(
    screen.getByLabelText('Portal user email', { exact: false }),
    { target: { value: 'employee@nap.test' } }
  );
  fireEvent.click(screen.getByRole('button', { name: 'Provision user' }));
  await screen.findByText(
    /Provisioning is pending or its status is unavailable/
  );
  expect(router.state.location.pathname).toBe(`/management/tenants/${tenant}`);
  expect(router.state.location.search).toBe(`?job=${jobId}`);
  expect(screen.queryByRole('button', { name: 'Provision user' })).toBeNull();
  expect(
    fetchMock.mock.calls.filter(([url]) => url.endsWith('/members'))
  ).toHaveLength(1);
});

it('preselects the sole ready employee and activates with its membership identifier', async () => {
  fixture('complete', true);
  mount(`/management/tenants/${tenant}`);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Activate tenant' })
  );
  expect(
    screen.getByRole('combobox', { name: 'Initial administrator' }).textContent
  ).toContain('employee@nap.test');
  fireEvent.click(screen.getByRole('button', { name: 'Verify and activate' }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(
        ([, init]) =>
          init?.body ===
          JSON.stringify({
            operation: 'activate',
            target: tenant,
            administrator: member,
          })
      )
    ).toBe(true)
  );
});

it('requires a choice among multiple ready employees and blocks incomplete memberships', async () => {
  const data = fixture('complete', true);
  data.members.push({ ...data.members[0], id: actor });
  mount(`/management/tenants/${tenant}`);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Activate tenant' })
  );
  expect(
    screen
      .getByRole('combobox', { name: 'Initial administrator' })
      .textContent?.trim()
  ).not.toContain('employee@nap.test');
  cleanup();
  data.members[1].ready = false;
  mount(`/management/tenants/${tenant}`);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Activate tenant' })
  );
  expect(
    screen
      .getByRole('button', { name: 'Verify and activate' })
      .hasAttribute('disabled')
  ).toBe(true);
});

it('does not report an unknown saved job as complete', async () => {
  const data = fixture();
  data.jobs = [];
  mount(`/management/tenants/${tenant}?job=${jobId}`);
  await screen.findByText(
    /Provisioning is pending or its status is unavailable/
  );
  expect(screen.queryByText(/^Provisioning complete/)).toBeNull();
});

it('refreshes a completed retry and reports its durable outcome', async () => {
  const data = fixture('failed');
  const fallback = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url, init) => {
    if (url.endsWith('/provision')) {
      data.jobs[0].stage = 'complete';
      data.jobs[0].failure_code = null;
      data.members[0].ready = true;
      return reply({ jobId });
    }
    return fallback(url, init);
  });
  mount(`/management/tenants/${tenant}`);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry provisioning' })
  );
  fireEvent.mouseDown(
    screen.getByRole('combobox', { name: 'Provisioning job' })
  );
  fireEvent.click(
    await screen.findByRole('option', { name: /employee — failed/ })
  );
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Retry provisioning' })[1]
  );
  await screen.findByText(
    'Provisioning complete. Review tenant readiness before activation.'
  );
  await screen.findByText(/Ready for activation checks/);
});

it('shows actionable server validation when a retry needs its original name', async () => {
  fixture('failed');
  const fallback = fetchMock.getMockImplementation()!;
  fetchMock.mockImplementation((url, init) =>
    url.endsWith('/provision')
      ? Promise.resolve(
          new Response(
            JSON.stringify({
              version: 1,
              code: 'INVALID_INPUT',
              message: 'Enter the name for the initial record.',
            }),
            { status: 400 }
          )
        )
      : fallback(url, init)
  );
  mount(`/management/tenants/${tenant}`);
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry provisioning' })
  );
  fireEvent.mouseDown(
    screen.getByRole('combobox', { name: 'Provisioning job' })
  );
  fireEvent.click(
    await screen.findByRole('option', { name: /employee — failed/ })
  );
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Retry provisioning' })[1]
  );
  await screen.findByText(/Enter the name for the initial record/);
  expect(
    screen.getByLabelText('Employee or contact name', { exact: false })
  ).toBeDefined();
});
