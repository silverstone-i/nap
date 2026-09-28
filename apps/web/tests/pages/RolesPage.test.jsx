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
import { RolesPage } from '../../src/pages/management/RolesPage.jsx';
import { ContextualActionHeader } from '../../src/shell/ContextualActionHeader.jsx';
import { PageHeaderProvider } from '../../src/shell/PageHeaderContext.jsx';
import { ThemeModeProvider } from '../../src/theme/ThemeModeContext.jsx';
import { capabilitiesFixture, installMatchMedia } from '../testUtils.jsx';

vi.mock('../../src/api/endpoints.js', () => ({
  listCapabilities: vi.fn(),
  listRoles: vi.fn(),
  getRole: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  archiveRole: vi.fn(),
  restoreRole: vi.fn(),
  getUserRoles: vi.fn(),
  assignUserRole: vi.fn(),
  removeUserRole: vi.fn(),
  listUsersPage: vi.fn(),
}));

vi.mock('../../src/auth/SessionContext.jsx', () => ({
  useSession: vi.fn(),
}));

const TENANT = { id: 't1', code: 'ACME', name: 'Acme', tier: 'standard' };

/** A session on ACME whose capabilities are `patterns`. */
function sessionFor(patterns = ['ACME::*::*::*']) {
  return {
    selectedTenant: TENANT,
    capabilities: capabilitiesFixture({ patterns, targetTenant: TENANT }),
    refreshCapabilities: vi.fn(),
  };
}

const ADMIN = {
  id: 'r1',
  code: 'tenant_admin',
  name: 'Tenant admin',
  description: null,
  isImmutable: true,
  archived: false,
  revision: 1,
  grants: ['ACME::*::*::*'],
};

const CUSTOM = {
  id: 'r2',
  code: 'auditor',
  name: 'Auditor',
  description: 'Reads things',
  isImmutable: false,
  archived: false,
  revision: 3,
  grants: [
    'ACME::access-control::roles::read',
    'ACME::admin-tenancy::tenants::read',
    '*::*::*::read',
  ],
};

const ARCHIVED = {
  ...CUSTOM,
  id: 'r3',
  code: 'old',
  name: 'Old',
  archived: true,
};

const CATALOGUE = [
  {
    capability: 'access-control::roles::read',
    module: 'access-control',
    router: 'roles',
    action: 'read',
  },
  {
    capability: 'access-control::roles::write',
    module: 'access-control',
    router: 'roles',
    action: 'write',
  },
];

function renderPage() {
  return render(
    <ThemeModeProvider>
      <PageHeaderProvider>
        <ContextualActionHeader />
        <RolesPage />
      </PageHeaderProvider>
    </ThemeModeProvider>
  );
}

beforeEach(() => {
  installMatchMedia();
  useSession.mockReturnValue(sessionFor());
  api.listRoles.mockResolvedValue([ADMIN, CUSTOM]);
  api.listCapabilities.mockResolvedValue(CATALOGUE);
  api.listUsersPage.mockResolvedValue({
    rows: [{ id: 'u1', email: 'a@example.com' }],
    nextCursor: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openRole(user, name) {
  await user.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog');
}

describe('RolesPage (M0003-R016)', () => {
  it('asks for a tenant when none is selected', () => {
    useSession.mockReturnValue({ ...sessionFor(), selectedTenant: null });
    renderPage();
    expect(
      screen.getByText('Select a tenant to manage its roles.')
    ).toBeTruthy();
    expect(api.listRoles).not.toHaveBeenCalled();
  });

  it('lists roles with Immutable / Custom badges and an Archived indicator', async () => {
    api.listRoles.mockResolvedValue([ADMIN, CUSTOM, ARCHIVED]);
    renderPage();
    const table = await screen.findByRole('table', { name: 'Roles' });
    expect(within(table).getByText('Immutable')).toBeTruthy();
    expect(within(table).getAllByText('Custom')).toHaveLength(2);
    expect(within(table).getByText('Archived')).toBeTruthy();
  });

  it('requests archived roles when the toggle is on', async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Auditor');
    await user.click(screen.getByLabelText('Include archived'));
    expect(api.listRoles).toHaveBeenLastCalledWith({ includeArchived: true });
  });

  it('shows grants grouped by module, with * as "All modules"', async () => {
    renderPage();
    const user = userEvent.setup();
    const dialog = await openRole(user, 'Auditor');
    const groups = within(dialog).getAllByRole('region');
    expect(groups.map(group => group.getAttribute('aria-label'))).toEqual([
      'All modules',
      'access-control',
      'admin-tenancy',
    ]);
    expect(
      within(groups[1]).getByText('ACME::access-control::roles::read')
    ).toBeTruthy();
  });

  it('hides Edit and Archive for an immutable role', async () => {
    renderPage();
    const user = userEvent.setup();
    const dialog = await openRole(user, 'Tenant admin');
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(
      within(dialog).queryByRole('button', { name: 'Archive' })
    ).toBeNull();
  });

  it('creates a role with a catalogue grant and a wildcard grant', async () => {
    api.createRole.mockResolvedValue({ ...CUSTOM, id: 'r9' });
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Auditor');
    await user.click(screen.getByRole('button', { name: 'Create role' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Code/), 'reader');
    await user.type(within(dialog).getByLabelText(/Name/), 'Reader');
    await within(dialog).findByRole('option', { name: 'access-control' });
    await user.selectOptions(
      within(dialog).getByLabelText('Module'),
      'access-control'
    );
    await user.selectOptions(within(dialog).getByLabelText('Router'), 'roles');
    await user.selectOptions(within(dialog).getByLabelText('Action'), 'read');
    await user.click(within(dialog).getByRole('button', { name: 'Add grant' }));
    await user.selectOptions(within(dialog).getByLabelText('Module'), '*');
    const tenantField = within(dialog).getByLabelText('Tenant');
    await user.clear(tenantField);
    await user.type(tenantField, '*');
    await user.click(within(dialog).getByRole('button', { name: 'Add grant' }));
    await user.click(
      within(dialog).getByRole('button', { name: 'Create role' })
    );

    expect(api.createRole).toHaveBeenCalledWith({
      code: 'reader',
      name: 'Reader',
      grants: ['ACME::access-control::roles::read', '*::*::*::*'],
    });
  });

  it('edits a custom role with its revision and reloads it on STALE_REVISION', async () => {
    api.updateRole.mockRejectedValue(new ApiError('STALE_REVISION', 409));
    api.getRole.mockResolvedValue({
      ...CUSTOM,
      name: 'Auditor v2',
      revision: 4,
    });
    renderPage();
    const user = userEvent.setup();
    const detail = await openRole(user, 'Auditor');
    await user.click(within(detail).getByRole('button', { name: 'Edit' }));
    const form = await screen.findByRole('dialog');
    await user.click(within(form).getByRole('button', { name: 'Save role' }));

    expect(api.updateRole).toHaveBeenCalledWith('r2', {
      name: 'Auditor',
      description: 'Reads things',
      grants: CUSTOM.grants,
      revision: 3,
    });
    expect(
      await within(form).findByText(/Someone else changed this role/)
    ).toBeTruthy();
    expect(api.getRole).toHaveBeenCalledWith('r2');
    expect(within(form).getByDisplayValue('Auditor v2')).toBeTruthy();
  });

  it('archives after confirmation, then restores', async () => {
    api.archiveRole.mockResolvedValue({
      ...CUSTOM,
      archived: true,
      revision: 4,
    });
    api.restoreRole.mockResolvedValue({ ...CUSTOM, revision: 5 });
    renderPage();
    const user = userEvent.setup();
    const detail = await openRole(user, 'Auditor');
    await user.click(within(detail).getByRole('button', { name: 'Archive' }));
    const confirm = await screen.findByRole('dialog', {
      name: 'Archive role?',
    });
    expect(api.archiveRole).not.toHaveBeenCalled();
    await user.click(within(confirm).getByRole('button', { name: 'Archive' }));
    expect(api.archiveRole).toHaveBeenCalledWith('r2', 3);

    await user.click(await screen.findByRole('button', { name: 'Restore' }));
    expect(api.restoreRole).toHaveBeenCalledWith('r2', 4);
  });

  it('shows ROLE_IMMUTABLE readably', async () => {
    api.archiveRole.mockRejectedValue(new ApiError('ROLE_IMMUTABLE', 409));
    renderPage();
    const user = userEvent.setup();
    const detail = await openRole(user, 'Auditor');
    await user.click(within(detail).getByRole('button', { name: 'Archive' }));
    const confirm = await screen.findByRole('dialog', {
      name: 'Archive role?',
    });
    await user.click(within(confirm).getByRole('button', { name: 'Archive' }));
    expect(
      await screen.findByText('This role is immutable and cannot be changed.')
    ).toBeTruthy();
  });

  it("assigns and removes a user's role", async () => {
    api.getUserRoles.mockResolvedValue({ userId: 'u1', roles: [ADMIN] });
    api.assignUserRole.mockResolvedValue({
      userId: 'u1',
      roles: [ADMIN, CUSTOM],
    });
    api.removeUserRole.mockResolvedValue({ userId: 'u1', roles: [ADMIN] });
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Auditor');
    const section = screen.getByRole('region', { name: 'User roles' });
    await within(section).findByRole('option', { name: 'a@example.com' });
    await user.selectOptions(within(section).getByLabelText('User'), 'u1');
    await within(section).findByRole('button', { name: 'Tenant admin' });

    await user.selectOptions(
      within(section).getByLabelText('Role to assign'),
      'r2'
    );
    await user.click(
      within(section).getByRole('button', { name: 'Assign role' })
    );
    expect(api.assignUserRole).toHaveBeenCalledWith('u1', 'r2');
    const chip = await within(section).findByRole('button', {
      name: 'Auditor',
    });

    await user.click(within(chip).getByTestId('CancelIcon'));
    const confirm = await screen.findByRole('dialog', { name: 'Remove role?' });
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    expect(api.removeUserRole).toHaveBeenCalledWith('u1', 'r2');
  });

  it('shows LAST_ADMIN readably when removal is refused', async () => {
    api.getUserRoles.mockResolvedValue({ userId: 'u1', roles: [ADMIN] });
    api.removeUserRole.mockRejectedValue(new ApiError('LAST_ADMIN', 409));
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Auditor');
    const section = screen.getByRole('region', { name: 'User roles' });
    await within(section).findByRole('option', { name: 'a@example.com' });
    await user.selectOptions(within(section).getByLabelText('User'), 'u1');
    const chip = await within(section).findByRole('button', {
      name: 'Tenant admin',
    });
    await user.click(within(chip).getByTestId('CancelIcon'));
    const confirm = await screen.findByRole('dialog', { name: 'Remove role?' });
    await user.click(within(confirm).getByRole('button', { name: 'Remove' }));
    expect(
      await screen.findByText('This would remove the last administrator.')
    ).toBeTruthy();
  });

  describe('without access-control::roles::write (I0005-R011)', () => {
    beforeEach(() => {
      useSession.mockReturnValue(
        sessionFor(['ACME::access-control::roles::read'])
      );
    });

    it('hides Create role', async () => {
      renderPage();
      await screen.findByText('Auditor');
      expect(screen.queryByRole('button', { name: 'Create role' })).toBeNull();
    });

    it('hides Edit and Archive for a custom role', async () => {
      renderPage();
      const user = userEvent.setup();
      const dialog = await openRole(user, 'Auditor');
      expect(within(dialog).queryByRole('button', { name: 'Edit' })).toBeNull();
      expect(
        within(dialog).queryByRole('button', { name: 'Archive' })
      ).toBeNull();
    });
  });
});
