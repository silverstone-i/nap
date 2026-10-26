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
import { RolesPage } from '../../src/pages/management/RolesPage.jsx';
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
  listCapabilities: vi.fn(),
  listRoles: vi.fn(),
  getRole: vi.fn(),
  createRole: vi.fn(),
  updateRole: vi.fn(),
  archiveRole: vi.fn(),
  restoreRole: vi.fn(),
  bulkRoleAction: vi.fn(),
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

function renderPage(entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ThemeModeProvider>
        <NoticeProvider>
          <PageHeaderProvider>
            <ContextualActionHeader />
            <RolesPage />
          </PageHeaderProvider>
        </NoticeProvider>
      </ThemeModeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  installMatchMedia();
  installResizeObserver();
  useSession.mockReturnValue(sessionFor());
  api.listRoles.mockResolvedValue([ADMIN, CUSTOM]);
  api.listCapabilities.mockResolvedValue(CATALOGUE);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openRole(user, name) {
  await user.click(await screen.findByRole('button', { name }));
  return screen.findByRole('dialog');
}

/** The ⋮ menu button on the grid row that names `name`. */
function rowMenu(name) {
  const row = screen.getByRole('button', { name }).closest('[role="row"]');
  return within(row).getByRole('menuitem', { name: 'more' });
}

describe('RolesPage (M0003-R016–R018)', () => {
  it('asks for a tenant when none is selected', () => {
    useSession.mockReturnValue({ ...sessionFor(), selectedTenant: null });
    renderPage();
    expect(
      screen.getByText('Select a tenant to manage its roles.')
    ).toBeTruthy();
    expect(api.listRoles).not.toHaveBeenCalled();
  });

  it('marks only an immutable role, beside its name, with no Type column (M0003-R025)', async () => {
    api.listRoles.mockResolvedValue([ADMIN, CUSTOM]);
    renderPage();
    await screen.findByText('Auditor');
    const table = screen.getByRole('grid');
    expect(within(table).getAllByText('Immutable')).toHaveLength(1);
    expect(within(table).queryByText('Custom')).toBeNull();
    expect(
      within(table).queryByRole('columnheader', { name: 'Type' })
    ).toBeNull();
  });

  it('lists archived roles in the Archived tab, with no filter popover or create action (I0011-R001–R005)', async () => {
    api.listRoles.mockImplementation(async ({ archived } = {}) =>
      archived ? [ARCHIVED] : [ADMIN, CUSTOM]
    );
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Auditor');
    expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
    await user.click(screen.getByRole('tab', { name: 'Archived' }));
    const table = screen.getByRole('grid');
    await within(table).findByText('Old');
    expect(within(table).queryByText('Auditor')).toBeNull();
    expect(api.listRoles).toHaveBeenCalledWith({ archived: true });
    expect(screen.queryByRole('button', { name: 'New role' })).toBeNull();
  });

  it('searches roles by name or code in the header', async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Auditor');
    await user.type(screen.getByLabelText('Search by name'), 'tenant');
    expect(await screen.findByText('Tenant admin')).toBeTruthy();
    await vi.waitFor(() => expect(screen.queryByText('Auditor')).toBeNull());
    // The search filters the loaded list; it does not ask the server again.
    expect(api.listRoles).toHaveBeenCalledTimes(1);
  });

  it("offers Edit then Archive in a custom role's row menu, and nothing for an immutable role (I0001-R027)", async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Auditor');
    await user.click(rowMenu('Auditor'));
    const items = (await screen.findAllByRole('menuitem'))
      .map(item => item.textContent)
      .filter(text => text === 'Edit' || text === 'Archive');
    expect(items).toEqual(['Edit', 'Archive']);
    await user.keyboard('{Escape}');
    const adminRow = screen
      .getByRole('button', { name: 'Tenant admin' })
      .closest('[role="row"]');
    expect(
      within(adminRow).queryByRole('menuitem', { name: 'more' })
    ).toBeNull();
  });

  it('archives the selected roles in one request, and lists the ones refused (R018)', async () => {
    const other = {
      ...CUSTOM,
      id: 'r4',
      code: 'clerk',
      name: 'Clerk',
      revision: 1,
    };
    api.listRoles.mockResolvedValue([ADMIN, CUSTOM, other]);
    api.bulkRoleAction.mockRejectedValueOnce(
      new ApiError('BULK_FAILED', 409, null, {
        details: [{ id: 'r1', code: 'ROLE_IMMUTABLE' }],
      })
    );
    api.bulkRoleAction.mockResolvedValueOnce([]);
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Clerk');
    const boxes = screen.getAllByRole('checkbox', { name: /select row/i });
    for (const box of boxes) await user.click(box);
    await user.click(
      screen.getByRole('button', { name: 'Archive selected (3)' })
    );
    let dialog = await screen.findByRole('dialog', {
      name: 'Archive 3 roles?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    expect(api.bulkRoleAction).toHaveBeenCalledWith('archive', [
      { id: 'r1', revision: 1 },
      { id: 'r2', revision: 3 },
      { id: 'r4', revision: 1 },
    ]);
    dialog = await screen.findByRole('dialog', { name: 'Nothing was changed' });
    expect(
      within(dialog).getByText(
        'Tenant admin: This role is immutable and cannot be changed.'
      )
    ).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    // The selection is kept; deselect the immutable role and retry.
    await user.click(boxes[0]);
    await user.click(
      screen.getByRole('button', { name: 'Archive selected (2)' })
    );
    dialog = await screen.findByRole('dialog', { name: 'Archive 2 roles?' });
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText('2 roles archived.')).toBeTruthy();
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
    expect(
      within(dialog).queryByRole('button', { name: 'Edit name' })
    ).toBeNull();
    expect(
      within(dialog).queryByRole('button', { name: 'Edit grants' })
    ).toBeNull();
    expect(
      within(dialog).queryByRole('button', { name: 'Archive' })
    ).toBeNull();
  });

  it('creates a role with only its code and name, then sets grants on its detail (M0003-R019, R020)', async () => {
    const created = { ...CUSTOM, id: 'r9', name: 'Reader', grants: [] };
    api.createRole.mockResolvedValue(created);
    api.updateRole.mockResolvedValue({
      ...created,
      grants: ['ACME::access-control::roles::read', '*::*::*::*'],
      revision: 4,
    });
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Auditor');
    await user.click(screen.getByRole('button', { name: 'New role' }));
    const form = await screen.findByRole('dialog', { name: 'New role' });
    expect(within(form).queryByLabelText('Description')).toBeNull();
    expect(within(form).queryByLabelText('Module')).toBeNull();
    await user.type(within(form).getByLabelText(/Code/), 'reader');
    await user.type(within(form).getByLabelText(/Name/), 'Reader');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Reader created.')).toBeTruthy();
    expect(api.createRole).toHaveBeenCalledWith({
      code: 'reader',
      name: 'Reader',
      grants: [],
    });

    // The new role's detail opens, where the grants are set.
    const detail = await screen.findByRole('dialog', { name: /Reader/ });
    await user.click(
      within(detail).getByRole('button', { name: 'Edit grants' })
    );
    const dialog = await screen.findByRole('dialog', { name: 'Edit grants' });
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
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(api.updateRole).toHaveBeenCalledWith('r9', {
      grants: ['ACME::access-control::roles::read', '*::*::*::*'],
      revision: 3,
    });
  });

  it('links to the archived role when its code is taken (I0011-R008)', async () => {
    api.createRole.mockRejectedValue(
      new ApiError('CONFLICT', 409, null, {
        details: { id: 'r3', archived: true },
      })
    );
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Auditor');
    await user.click(screen.getByRole('button', { name: 'New role' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Code/), 'old');
    await user.type(within(dialog).getByLabelText(/Name/), 'Old');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText(/An archived role already uses this code/)
    ).toBeTruthy();
    const link = within(dialog).getByRole('link', {
      name: 'Show it in Archived',
    });
    expect(link.getAttribute('href')).toBe(
      '/settings/roles?view=archived&q=old'
    );
  });

  it('edits the name and description from a pencil, with no footer Edit, and reloads on STALE_REVISION (M0003-R019)', async () => {
    api.updateRole.mockRejectedValue(new ApiError('STALE_REVISION', 409));
    api.getRole.mockResolvedValue({
      ...CUSTOM,
      name: 'Auditor v2',
      revision: 4,
    });
    renderPage();
    const user = userEvent.setup();
    const detail = await openRole(user, 'Auditor');
    expect(within(detail).queryByRole('button', { name: 'Edit' })).toBeNull();
    await user.click(within(detail).getByRole('button', { name: 'Edit name' }));
    const form = await screen.findByRole('dialog', { name: 'Edit name' });
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    expect(api.updateRole).toHaveBeenCalledWith('r2', {
      name: 'Auditor',
      description: 'Reads things',
      revision: 3,
    });
    expect(
      await within(form).findByText(/Someone else changed this role/)
    ).toBeTruthy();
    expect(api.getRole).toHaveBeenCalledWith('r2');
    // The detail behind shows the reloaded role once the pencil closes.
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(
      await screen.findByRole('dialog', { name: /Auditor v2/ })
    ).toBeTruthy();
  });

  it("opens the role's detail from the row menu's Edit (M0003-R019)", async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Auditor');
    await user.click(rowMenu('Auditor'));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const detail = await screen.findByRole('dialog', { name: /Auditor/ });
    expect(
      within(detail).getByRole('button', { name: 'Edit grants' })
    ).toBeTruthy();
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
    expect(
      within(confirm).getByText(
        'An archived role grants nothing until it is restored.'
      )
    ).toBeTruthy();
    await user.click(within(confirm).getByRole('button', { name: 'Archive' }));
    expect(api.archiveRole).toHaveBeenCalledWith('r2', 3);
    expect(await screen.findByText('Auditor archived.')).toBeTruthy();

    // M0003-R022: Restore runs without asking.
    await user.click(await screen.findByRole('button', { name: 'Restore' }));
    expect(screen.queryByRole('dialog', { name: /Restore/ })).toBeNull();
    expect(api.restoreRole).toHaveBeenCalledWith('r2', 4);
    expect(await screen.findByText('Auditor restored.')).toBeTruthy();
  });

  it('AC14: archives from the row menu after "Archive role?" and restores a row without asking (M0003-R022, R023)', async () => {
    api.listRoles.mockImplementation(async ({ archived } = {}) =>
      archived ? [ARCHIVED] : [ADMIN, CUSTOM]
    );
    api.archiveRole.mockResolvedValue({ ...CUSTOM, archived: true });
    api.restoreRole.mockResolvedValue({ ...ARCHIVED, archived: false });
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Auditor');
    const menus = screen.getAllByRole('menuitem', { name: 'more' });
    await user.click(menus[menus.length - 1]);
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    const confirm = await screen.findByRole('dialog', {
      name: 'Archive role?',
    });
    await user.click(within(confirm).getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText('Auditor archived.')).toBeTruthy();

    await user.click(screen.getByRole('tab', { name: 'Archived' }));
    await screen.findByText('Old');
    await user.click(screen.getByRole('menuitem', { name: 'more' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Restore' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.restoreRole).toHaveBeenCalledWith('r3', ARCHIVED.revision);
    expect(await screen.findByText('Old restored.')).toBeTruthy();
  });

  it('AC15: shows the code helper only for an invalid code (M0003-R026)', async () => {
    renderPage();
    const user = userEvent.setup();
    await screen.findByText('Auditor');
    await user.click(screen.getByRole('button', { name: 'New role' }));
    const form = await screen.findByRole('dialog', { name: 'New role' });
    const helper =
      'Use lowercase letters, digits, and underscores, starting with a letter.';
    expect(within(form).queryByText(helper)).toBeNull();
    await user.type(within(form).getByLabelText(/Code/), 'Bad Code');
    expect(within(form).getByText(helper)).toBeTruthy();
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

  it('has no user role assignments section (M0003-R021)', async () => {
    renderPage();
    await screen.findByText('Auditor');
    expect(screen.queryByRole('region', { name: 'User roles' })).toBeNull();
  });

  describe('without access-control::roles::write (I0005-R011)', () => {
    beforeEach(() => {
      useSession.mockReturnValue(
        sessionFor(['ACME::access-control::roles::read'])
      );
    });

    it('hides New role, the checkboxes, and the row menus', async () => {
      renderPage();
      await screen.findByText('Auditor');
      expect(screen.queryByRole('button', { name: 'New role' })).toBeNull();
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
      expect(screen.queryAllByRole('menuitem', { name: 'more' })).toHaveLength(
        0
      );
    });

    it('hides Edit and Archive for a custom role', async () => {
      renderPage();
      const user = userEvent.setup();
      const dialog = await openRole(user, 'Auditor');
      expect(
        within(dialog).queryByRole('button', { name: 'Edit name' })
      ).toBeNull();
      expect(
        within(dialog).queryByRole('button', { name: 'Archive' })
      ).toBeNull();
    });
  });
});
