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
import { DirectoryRecordsPage } from '../../src/pages/directory/DirectoryRecordsPage.jsx';
import { LabelsPage } from '../../src/pages/directory/LabelsPage.jsx';
import { TaxIdFormatsPage } from '../../src/pages/directory/TaxIdFormatsPage.jsx';
import { PortalAccessDialog } from '../../src/pages/directory/PortalAccessDialog.jsx';
import { RecordDetailDialog } from '../../src/pages/directory/RecordDetailDialog.jsx';
import { RecordFormDialog } from '../../src/pages/directory/RecordFormDialog.jsx';
import { ContextualActionHeader } from '../../src/shell/ContextualActionHeader.jsx';
import { EffectiveSettingsProvider } from '../../src/shell/EffectiveSettingsContext.jsx';
import { NoticeProvider } from '../../src/shell/NoticeContext.jsx';
import { PageHeaderProvider } from '../../src/shell/PageHeaderContext.jsx';
import { ThemeModeProvider } from '../../src/theme/ThemeModeContext.jsx';
import { MemoryRouter } from 'react-router';
import {
  NAPSOFT_TENANT,
  capabilitiesFixture,
  installMatchMedia,
  installResizeObserver,
} from '../testUtils.jsx';

vi.mock('../../src/api/endpoints.js', () => ({
  listDirectoryPage: vi.fn(),
  bulkDirectoryAction: vi.fn(),
  getDirectoryRecord: vi.fn(),
  createDirectoryRecord: vi.fn(),
  updateDirectoryRecord: vi.fn(),
  archiveDirectoryRecord: vi.fn(),
  restoreDirectoryRecord: vi.fn(),
  revealTaxId: vi.fn(),
  retryPortalAccess: vi.fn(),
  addContactMethod: vi.fn(),
  updateContactMethod: vi.fn(),
  removeContactMethod: vi.fn(),
  addAddress: vi.fn(),
  updateAddress: vi.fn(),
  removeAddress: vi.fn(),
  findDetailMatches: vi.fn(),
  listContactLabels: vi.fn(),
  listRoles: vi.fn(),
  createContactLabel: vi.fn(),
  renameContactLabel: vi.fn(),
  archiveContactLabel: vi.fn(),
  restoreContactLabel: vi.fn(),
  bulkContactLabelAction: vi.fn(),
  listTaxIdFormats: vi.fn(),
  getEffectiveSettings: vi.fn(),
  createTaxIdFormat: vi.fn(),
  updateTaxIdFormat: vi.fn(),
  archiveTaxIdFormat: vi.fn(),
  restoreTaxIdFormat: vi.fn(),
  bulkTaxIdFormatAction: vi.fn(),
  listClientTenants: vi.fn(),
  listCellsOverview: vi.fn(),
  provisionTenant: vi.fn(),
  listCountries: vi.fn(async () => [
    { code: 'US', alpha3: 'USA', numericCode: '840', name: 'United States' },
  ]),
}));

vi.mock('../../src/auth/SessionContext.jsx', () => ({
  useSession: vi.fn(),
}));

const TENANT = { id: 't1', code: 'ACME', name: 'Acme', tier: 'standard' };
const role = (id, code, name, archived = false) => ({
  id,
  code,
  name,
  description: null,
  isImmutable: false,
  archived,
  revision: 1,
  grants: [],
});
const CLERK = role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'clerk', 'Clerk');
const MANAGER = role(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'manager',
  'Manager'
);
const ALL = ['ACME::*::*::*'];
const NO_TAX = [
  'ACME::business-directory::directory::read',
  'ACME::business-directory::directory::write',
];

function sessionFor(patterns = ALL) {
  return {
    selectedTenant: TENANT,
    capabilities: capabilitiesFixture({ patterns, targetTenant: TENANT }),
    refreshCapabilities: vi.fn(),
  };
}

const SSN = {
  id: '5a5a5a5a-5a5a-4a5a-8a5a-5a5a5a5a5a5a',
  country: 'US',
  name: 'SSN',
  mask: '###-##-####',
  archived: false,
  revision: 1,
};
const EIN = {
  id: '5b5b5b5b-5b5b-4b5b-8b5b-5b5b5b5b5b5b',
  country: 'US',
  name: 'EIN',
  mask: '##-#######',
  archived: false,
  revision: 1,
};

const JANE = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'employee',
  firstName: 'Jane',
  lastName: 'Doe',
  taxIdLast4: '6789',
  taxIdFormatId: SSN.id,
  isPortalUser: true,
  portalAccess: { status: 'on', failureCode: null },
  archived: false,
  revision: 2,
  primaryEmail: 'jane@acme.test',
  primaryPhone: null,
};

/** Jane without portal access, so an edit needs no roles. */
const STAFF = {
  ...JANE,
  isPortalUser: false,
  portalAccess: { status: 'off', failureCode: null },
};

function renderWithHeader(element, entry = '/') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ThemeModeProvider>
        <NoticeProvider>
          <PageHeaderProvider>
            <ContextualActionHeader />
            {element}
          </PageHeaderProvider>
        </NoticeProvider>
      </ThemeModeProvider>
    </MemoryRouter>
  );
}

/** Rows the mocked list pages return. */
let listRows = [];
let contactRows = [];

beforeEach(() => {
  installMatchMedia();
  installResizeObserver();
  useSession.mockReturnValue(sessionFor());
  api.listTaxIdFormats.mockResolvedValue([SSN, EIN]);
  api.findDetailMatches.mockResolvedValue({ matches: [] });
  listRows = [JANE];
  contactRows = [];
  // M0005-R027: lists are cursor pages; an organization's contacts come
  // from their own list.
  api.listDirectoryPage.mockImplementation(async collection => ({
    rows: collection === 'organization-contacts' ? contactRows : listRows,
    nextCursor: null,
  }));
  api.getDirectoryRecord.mockResolvedValue({
    ...JANE,
    contactMethods: [],
    addresses: [],
  });
  api.listContactLabels.mockResolvedValue([]);
  api.listRoles.mockResolvedValue([
    CLERK,
    MANAGER,
    role('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'old', 'Old', true),
  ]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Phones in the tenant default country (M0005-R046)', () => {
  it('AC29: shows a GB phone in national form and a US phone internationally', async () => {
    api.getEffectiveSettings.mockResolvedValue({
      defaultCountry: 'GB',
      currency: 'GBP',
      timeZone: 'Europe/London',
      dateFormat: 'DD/MM/YYYY',
      language: 'en',
      recordsPerPage: 25,
    });
    listRows = [
      { ...JANE, primaryPhone: '+442079460958' },
      {
        ...JANE,
        id: '22222222-2222-4222-8222-222222222222',
        firstName: 'Sam',
        primaryPhone: '+12125551234',
      },
    ];
    renderWithHeader(
      <EffectiveSettingsProvider tenantId={TENANT.id}>
        <DirectoryRecordsPage kind="employee" />
      </EffectiveSettingsProvider>
    );
    const table = await screen.findByRole('grid', { name: 'Employees' });
    expect(await within(table).findByText('020 7946 0958')).toBeTruthy();
    expect(within(table).getByText('+1 212 555 1234')).toBeTruthy();
  });
});

describe('Employees (M0005-R026)', () => {
  it('lists employees with masked tax IDs and reveals one on request', async () => {
    api.revealTaxId.mockResolvedValue('123456789');
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const table = await screen.findByRole('grid', { name: 'Employees' });
    // M0005-R040: masked in its format's layout.
    expect(await within(table).findByText('•••-••-6789')).toBeTruthy();
    expect(api.listDirectoryPage).toHaveBeenCalledWith(
      'people',
      expect.objectContaining({ kind: 'employee' })
    );
    expect(within(table).getByText('•••-••-6789')).toBeTruthy();
    expect(within(table).queryByText('123456789')).toBeNull();
    expect(within(table).getByText('On')).toBeTruthy();

    const user = userEvent.setup();
    await user.click(within(table).getByRole('button', { name: 'Jane Doe' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reveal' }));
    expect(await within(dialog).findByText('Tax ID: 123-45-6789')).toBeTruthy();
    expect(api.revealTaxId).toHaveBeenCalledWith('people', JANE.id);
  });

  it('edits the name from its pencil and retries a stale edit with the reloaded revision (M0005-R049)', async () => {
    const changed = {
      ...STAFF,
      lastName: 'Smith',
      revision: 3,
      contactMethods: [],
      addresses: [],
    };
    api.updateDirectoryRecord.mockRejectedValueOnce(
      new ApiError('STALE_REVISION', 409)
    );
    listRows = [STAFF];
    api.getDirectoryRecord.mockResolvedValue({
      ...STAFF,
      contactMethods: [],
      addresses: [],
    });
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const table = await screen.findByRole('grid', { name: 'Employees' });
    const user = userEvent.setup();
    await user.click(
      await within(table).findByRole('button', { name: 'Jane Doe' })
    );
    const detail = await screen.findByRole('dialog', { name: /Jane Doe/ });
    // R049: no footer Edit; the name has its own pencil.
    expect(within(detail).queryByRole('button', { name: 'Edit' })).toBeNull();
    await user.click(within(detail).getByRole('button', { name: 'Edit name' }));
    const form = await screen.findByRole('dialog', { name: 'Edit name' });
    api.getDirectoryRecord.mockResolvedValue(changed);
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(api.updateDirectoryRecord).toHaveBeenCalledWith('people', JANE.id, {
      firstName: 'Jane',
      lastName: 'Doe',
      revision: 2,
    });

    expect(await within(form).findByText(/This record changed/)).toBeTruthy();
    // The form refills from the reloaded record, so the retry carries its
    // revision and keeps the other change instead of overwriting it.
    expect(await within(form).findByDisplayValue('Smith')).toBeTruthy();
    expect(within(form).getByText(/This record changed/)).toBeTruthy();
    api.updateDirectoryRecord.mockResolvedValueOnce({ ...changed });
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(api.updateDirectoryRecord).toHaveBeenLastCalledWith(
      'people',
      JANE.id,
      { firstName: 'Jane', lastName: 'Smith', revision: 3 }
    );
  });

  it('shows the reloaded record after cancelling a stale edit', async () => {
    api.updateDirectoryRecord.mockRejectedValue(
      new ApiError('STALE_REVISION', 409)
    );
    listRows = [STAFF];
    api.getDirectoryRecord.mockResolvedValue({
      ...STAFF,
      contactMethods: [],
      addresses: [],
    });
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const table = await screen.findByRole('grid', { name: 'Employees' });
    const user = userEvent.setup();
    await user.click(
      await within(table).findByRole('button', { name: 'Jane Doe' })
    );
    const detail = await screen.findByRole('dialog', { name: /Jane Doe/ });
    await user.click(within(detail).getByRole('button', { name: 'Edit name' }));
    const form = await screen.findByRole('dialog', { name: 'Edit name' });
    api.getDirectoryRecord.mockResolvedValue({
      ...STAFF,
      lastName: 'Smith',
      revision: 3,
      contactMethods: [],
      addresses: [],
    });
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await within(form).findByText(/This record changed/);
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(
      await screen.findByRole('dialog', { name: /Jane Smith/ })
    ).toBeTruthy();
  });

  it('searches by name and tax ID from the header, with chips for active filters (I0001-R029)', async () => {
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    await within(
      await screen.findByRole('grid', { name: 'Employees' })
    ).findByText('Jane Doe');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search by name'), 'jan');
    await vi.waitFor(() =>
      expect(api.listDirectoryPage).toHaveBeenLastCalledWith(
        'people',
        expect.objectContaining({ kind: 'employee', q: 'jan' })
      )
    );
    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.queryByLabelText('Include archived')).toBeNull();
    await user.type(screen.getByLabelText('Tax ID'), '123456789');
    await vi.waitFor(() =>
      expect(api.listDirectoryPage).toHaveBeenLastCalledWith(
        'people',
        expect.objectContaining({
          q: 'jan',
          taxId: '123456789',
          archived: false,
        })
      )
    );
    await user.keyboard('{Escape}');
    const chips = screen.getByLabelText('Active filters');
    expect(within(chips).getByText('Tax ID')).toBeTruthy();
    // I0011-R006: switching views keeps the search and filters.
    await user.click(screen.getByRole('tab', { name: 'Archived' }));
    await vi.waitFor(() =>
      expect(api.listDirectoryPage).toHaveBeenLastCalledWith(
        'people',
        expect.objectContaining({
          q: 'jan',
          taxId: '123456789',
          archived: true,
        })
      )
    );
    expect(screen.queryByRole('button', { name: 'New employee' })).toBeNull();
  });

  it('hides tax ID search, reveal, and entry without the tax ID capabilities', async () => {
    useSession.mockReturnValue(sessionFor(NO_TAX));
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    await within(
      await screen.findByRole('grid', { name: 'Employees' })
    ).findByText('Jane Doe');
    const user = userEvent.setup();
    // Tax ID is the only filter, so there is no filter popover.
    expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Jane Doe' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Reveal' })).toBeNull();
    expect(
      within(dialog).queryByRole('button', { name: 'Edit tax ID' })
    ).toBeNull();
  });

  it('creates an employee with only a name and primary email, then opens it (M0005-R050)', async () => {
    api.createDirectoryRecord.mockResolvedValue({ ...STAFF });
    api.getDirectoryRecord.mockResolvedValue({
      ...STAFF,
      contactMethods: [],
      addresses: [],
    });
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'New employee' })
    );
    const form = await screen.findByRole('dialog', { name: 'New employee' });
    expect(within(form).queryByLabelText('Tax ID')).toBeNull();
    expect(within(form).queryByLabelText('Portal access')).toBeNull();
    await user.type(within(form).getByLabelText(/First name/), 'Jane');
    await user.type(within(form).getByLabelText(/Last name/), 'Doe');
    await user.type(
      within(form).getByLabelText(/Primary email/),
      'jane@acme.test'
    );
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(api.createDirectoryRecord).toHaveBeenCalledWith('people', {
      kind: 'employee',
      firstName: 'Jane',
      lastName: 'Doe',
      primaryEmail: 'jane@acme.test',
    });
    expect(
      await screen.findByRole('dialog', { name: /Jane Doe/ })
    ).toBeTruthy();
  });

  /** Open Jane's detail and save an SSN from the tax ID pencil. */
  async function saveSsnOnJane() {
    listRows = [STAFF];
    api.getDirectoryRecord.mockResolvedValue({
      ...STAFF,
      contactMethods: [],
      addresses: [],
    });
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Jane Doe' }));
    const detail = await screen.findByRole('dialog', { name: /Jane Doe/ });
    await user.click(
      within(detail).getByRole('button', { name: 'Edit tax ID' })
    );
    const form = await screen.findByRole('dialog', { name: 'Edit tax ID' });
    // M0005-R043: a person's tax ID defaults to US SSN.
    expect(
      within(form).getByRole('combobox', { name: 'Tax ID format' }).textContent
    ).toBe('US SSN');
    await user.type(
      within(form).getByRole('textbox', { name: 'Tax ID' }),
      '123-45-6789'
    );
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    return form;
  }

  it('keeps the typed tax ID after a stale save and retries with the reloaded revision', async () => {
    const fresh = { ...STAFF, revision: 3, contactMethods: [], addresses: [] };
    // Someone else saved meanwhile, so the reload returns revision 3.
    api.updateDirectoryRecord.mockImplementationOnce(async () => {
      api.getDirectoryRecord.mockResolvedValue(fresh);
      throw new ApiError('STALE_REVISION', 409);
    });
    const form = await saveSsnOnJane();
    expect(await within(form).findByText(/This record changed/)).toBeTruthy();
    await vi.waitFor(() =>
      expect(api.getDirectoryRecord).toHaveBeenCalledTimes(2)
    );
    // The stored value is never shown, so nothing replaces the draft.
    expect(within(form).getByRole('textbox', { name: 'Tax ID' }).value).toBe(
      '123-45-6789'
    );
    api.updateDirectoryRecord.mockResolvedValueOnce(fresh);
    const user = userEvent.setup();
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(api.updateDirectoryRecord).toHaveBeenLastCalledWith(
      'people',
      JANE.id,
      { taxId: '123-45-6789', taxIdFormatId: SSN.id, revision: 3 }
    );
  });

  const HOLDER = '22222222-2222-4222-8222-222222222222';

  it('names the employee already holding the tax ID, with a link to open it (M0005-R048, R052)', async () => {
    api.updateDirectoryRecord.mockRejectedValue(
      new ApiError('DUPLICATE_TAX_ID', 409, null, {
        details: { id: HOLDER, archived: false },
      })
    );
    const form = await saveSsnOnJane();
    expect(api.updateDirectoryRecord).toHaveBeenCalledWith('people', JANE.id, {
      taxId: '123-45-6789',
      taxIdFormatId: SSN.id,
      revision: 2,
    });
    expect(
      await within(form).findByText(/Another employee already has this tax ID/)
    ).toBeTruthy();
    expect(
      within(form).getByRole('link', { name: 'Open it' }).getAttribute('href')
    ).toBe(`/directory/employees?open=${HOLDER}`);
    // Following it closes the dialog and opens the holder on this page.
    api.getDirectoryRecord.mockResolvedValue({
      ...JANE,
      id: HOLDER,
      contactMethods: [],
      addresses: [],
    });
    await userEvent
      .setup()
      .click(within(form).getByRole('link', { name: 'Open it' }));
    expect(screen.queryByRole('dialog', { name: 'Edit tax ID' })).toBeNull();
    await vi.waitFor(() =>
      expect(api.getDirectoryRecord).toHaveBeenCalledWith('people', HOLDER)
    );
  });

  it('links an archived holder to the Archived view, where it can be restored (M0005-R048)', async () => {
    api.updateDirectoryRecord.mockRejectedValue(
      new ApiError('DUPLICATE_TAX_ID', 409, null, {
        details: { id: HOLDER, archived: true },
      })
    );
    const form = await saveSsnOnJane();
    expect(
      (
        await within(form).findByRole('link', { name: 'Show it in Archived' })
      ).getAttribute('href')
    ).toBe(`/directory/employees?view=archived&open=${HOLDER}`);
  });

  it('clears a tax ID from its dialog (M0005-R052)', async () => {
    listRows = [STAFF];
    api.getDirectoryRecord.mockResolvedValue({
      ...STAFF,
      contactMethods: [],
      addresses: [],
    });
    api.updateDirectoryRecord.mockResolvedValue({ ...STAFF });
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Jane Doe' }));
    const detail = await screen.findByRole('dialog', { name: /Jane Doe/ });
    await user.click(
      within(detail).getByRole('button', { name: 'Edit tax ID' })
    );
    const form = await screen.findByRole('dialog', { name: 'Edit tax ID' });
    await user.click(within(form).getByRole('button', { name: 'Clear' }));
    expect(api.updateDirectoryRecord).toHaveBeenCalledWith('people', JANE.id, {
      taxId: null,
      revision: 2,
    });
  });
});

describe('Portal access (I0008)', () => {
  // The form dialog restores focus to whatever opened it; stand one in.
  let opener;
  beforeEach(() => {
    opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
  });
  afterEach(() => {
    cleanup();
    opener.remove();
  });

  /** Render the portal access dialog for `record`. */
  function portalDialog(record, onStale = vi.fn()) {
    render(
      <ThemeModeProvider>
        <PortalAccessDialog
          collection="people"
          record={record}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          onStale={onStale}
        />
      </ThemeModeProvider>
    );
    return screen.findByRole('dialog', { name: 'Portal access' });
  }

  const CLERK_HELD = { id: CLERK.id, code: 'clerk', name: 'Clerk', held: true };

  /** Add Manager to Jane's roles and save into a stale revision. */
  async function staleRoleChange(onStale) {
    api.updateDirectoryRecord.mockRejectedValueOnce(
      new ApiError('STALE_REVISION', 409)
    );
    const form = await portalDialog({ ...JANE, roles: [CLERK_HELD] }, onStale);
    const user = userEvent.setup();
    await user.click(within(form).getByLabelText('Roles'));
    await user.click(await screen.findByRole('option', { name: 'Manager' }));
    await user.keyboard('{Escape}');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    return { form, user };
  }

  it('keeps the role draft after a stale save when access and roles did not change', async () => {
    const onStale = vi
      .fn()
      .mockResolvedValue({ ...JANE, roles: [CLERK_HELD], revision: 3 });
    const { form, user } = await staleRoleChange(onStale);
    expect(await within(form).findByText(/This record changed/)).toBeTruthy();
    expect(onStale).toHaveBeenCalledTimes(1);
    api.updateDirectoryRecord.mockResolvedValueOnce({ ...JANE });
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(api.updateDirectoryRecord).toHaveBeenCalledTimes(2);
    expect(api.updateDirectoryRecord).toHaveBeenLastCalledWith(
      'people',
      JANE.id,
      expect.objectContaining({ roleIds: [CLERK.id, MANAGER.id] })
    );
  });

  it('refills the roles after a stale save when the other change touched them', async () => {
    const managerHeld = { ...CLERK_HELD, id: MANAGER.id, name: 'Manager' };
    const onStale = vi
      .fn()
      .mockResolvedValue({ ...JANE, roles: [managerHeld], revision: 3 });
    const { form, user } = await staleRoleChange(onStale);
    expect(await within(form).findByText(/This record changed/)).toBeTruthy();
    api.updateDirectoryRecord.mockResolvedValueOnce({ ...JANE });
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(api.updateDirectoryRecord).toHaveBeenCalledTimes(2);
    expect(api.updateDirectoryRecord).toHaveBeenLastCalledWith(
      'people',
      JANE.id,
      expect.objectContaining({ roleIds: [MANAGER.id] })
    );
  });

  it('shows why the reload failed after a stale save', async () => {
    const onStale = vi.fn().mockRejectedValue(new ApiError('NOT_FOUND', 404));
    const { form } = await staleRoleChange(onStale);
    expect(
      await within(form).findByText('That record no longer exists.')
    ).toBeTruthy();
  });

  it('asks for a temporary password and a role when access is turned on (I0010-R013, R014)', async () => {
    api.updateDirectoryRecord.mockResolvedValue({ ...JANE });
    const form = await portalDialog({
      ...JANE,
      isPortalUser: false,
      portalAccess: { status: 'off', failureCode: null },
    });
    expect(within(form).queryByLabelText(/Temporary password/)).toBeNull();
    const user = userEvent.setup();
    await user.click(within(form).getByLabelText('Portal access'));
    await user.type(
      within(form).getByLabelText(/Temporary password/),
      'temp-pass'
    );
    // I0010-R005: a role is required to turn access on.
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(
      await within(form).findByText(
        'Choose at least one role for portal access.'
      )
    ).toBeTruthy();
    expect(api.updateDirectoryRecord).not.toHaveBeenCalled();
    await user.click(within(form).getByLabelText('Roles'));
    await user.click(await screen.findByRole('option', { name: 'Clerk' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(api.updateDirectoryRecord).toHaveBeenCalledWith('people', JANE.id, {
      isPortalUser: true,
      temporaryPassword: 'temp-pass',
      roleIds: [CLERK.id],
      revision: 2,
    });
  });

  it('hides the portal access pencil without the right to assign roles (I0010-R001, R013)', async () => {
    useSession.mockReturnValue(sessionFor(NO_TAX));
    api.getDirectoryRecord.mockResolvedValue({
      ...JANE,
      contactMethods: [],
      addresses: [],
    });
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Jane Doe' }));
    const dialog = await screen.findByRole('dialog', { name: /Jane Doe/ });
    expect(
      within(dialog).queryByRole('button', { name: 'Edit portal access' })
    ).toBeNull();
    expect(
      within(dialog).getByRole('button', { name: 'Edit name' })
    ).toBeTruthy();
  });

  it('sends the new role set when roles change while access stays on (I0010-R009)', async () => {
    api.updateDirectoryRecord.mockResolvedValue({ ...JANE });
    const form = await portalDialog({
      ...JANE,
      roles: [{ id: CLERK.id, code: 'clerk', name: 'Clerk', held: true }],
    });
    const user = userEvent.setup();
    await user.click(within(form).getByLabelText('Roles'));
    await user.click(await screen.findByRole('option', { name: 'Manager' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(api.updateDirectoryRecord).toHaveBeenCalledWith('people', JANE.id, {
      isPortalUser: true,
      roleIds: [CLERK.id, MANAGER.id],
      revision: 2,
    });
  });

  it('explains a refused turn-off of an administrator', async () => {
    api.updateDirectoryRecord.mockRejectedValue(
      new ApiError('ADMIN_ASSIGNED', 409)
    );
    const form = await portalDialog(JANE);
    const user = userEvent.setup();
    await user.click(within(form).getByLabelText('Portal access'));
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(
      await within(form).findByText(/holds an administrator role/)
    ).toBeTruthy();
  });

  it('shows why a request failed and retries it with a new temporary password', async () => {
    api.getDirectoryRecord.mockResolvedValue({
      ...JANE,
      portalAccess: { status: 'failed', failureCode: 'LOGIN_UNAVAILABLE' },
      contactMethods: [],
      addresses: [],
    });
    api.retryPortalAccess.mockResolvedValue({ ...JANE });
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Jane Doe' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(/This login is disabled/)
    ).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Retry' }));
    const retry = await screen.findByRole('dialog', {
      name: 'Retry portal access',
    });
    await user.type(
      within(retry).getByLabelText(/Temporary password/),
      'new-temp'
    );
    await user.click(within(retry).getByRole('button', { name: 'Retry' }));
    expect(api.retryPortalAccess).toHaveBeenCalledWith(
      'people',
      JANE.id,
      'new-temp'
    );
  });

  it("shows the person's roles in the detail, with no access switch (I0010-R004)", async () => {
    api.getDirectoryRecord.mockResolvedValue({
      ...JANE,
      contactMethods: [],
      addresses: [],
      roles: [
        { id: CLERK.id, code: 'clerk', name: 'Clerk', held: true },
        { id: MANAGER.id, code: 'manager', name: 'Manager', held: true },
      ],
    });
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Jane Doe' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Clerk')).toBeTruthy();
    expect(within(dialog).getByText('Manager')).toBeTruthy();
    // M0005-R059: the held-role note is the chip's tooltip, not a caption.
    expect(
      within(dialog).queryByText('Applies when this person first signs in.')
    ).toBeNull();
    expect(
      screen.getAllByLabelText('Applies when this person first signs in.')
        .length
    ).toBeGreaterThan(0);
    expect(
      within(dialog).queryByRole('checkbox', { name: 'Portal access' })
    ).toBeNull();
  });

  it('shows the pending-invitation note while invited', async () => {
    api.getDirectoryRecord.mockResolvedValue({
      ...JANE,
      portalAccess: { status: 'invited', failureCode: null },
      contactMethods: [],
      addresses: [],
    });
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Jane Doe' }));
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText('Waiting for first sign-in.')
    ).toBeTruthy();
  });
});

describe('Labels in the record detail (M0005-R014, R015)', () => {
  it('switches the contacts grid between Active and Archived inside the dialog (I0011-R002, R003)', async () => {
    const vendor = {
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'vendor',
      legalName: 'Tab Supply LLC',
      dbaName: null,
      taxIdLast4: null,
      archived: false,
      revision: 1,
      primaryEmail: null,
      primaryPhone: null,
    };
    listRows = [vendor];
    api.getDirectoryRecord.mockResolvedValue({
      ...vendor,
      contactMethods: [],
      addresses: [],
      contacts: [],
    });
    renderWithHeader(<DirectoryRecordsPage kind="vendor" />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Tab Supply LLC' })
    );
    const dialog = await screen.findByRole('dialog');
    const toolbar = await within(dialog).findByLabelText('Contacts toolbar');
    expect(
      within(toolbar)
        .getByRole('tab', { name: 'Active' })
        .getAttribute('aria-selected')
    ).toBe('true');
    expect(
      within(toolbar).getByRole('button', { name: 'New contact' })
    ).toBeTruthy();
    await user.click(within(toolbar).getByRole('tab', { name: 'Archived' }));
    await vi.waitFor(() =>
      expect(api.listDirectoryPage).toHaveBeenLastCalledWith(
        'organization-contacts',
        expect.objectContaining({ organizationId: vendor.id, archived: true })
      )
    );
    expect(
      within(toolbar).queryByRole('button', { name: 'New contact' })
    ).toBeNull();
    // The dialog's view stays out of the page URL, so the page stays on Active.
    const pageTab = screen
      .getAllByRole('tab', { name: 'Archived', hidden: true })
      .find(tab => !dialog.contains(tab));
    expect(pageTab.getAttribute('aria-selected')).toBe('false');
  });

  it('shows each email, phone, address, and contact with its label', async () => {
    const vendor = {
      id: '44444444-4444-4444-8444-444444444444',
      kind: 'vendor',
      legalName: 'Flag Supply LLC',
      dbaName: null,
      taxIdLast4: null,
      archived: false,
      revision: 1,
      primaryEmail: 'ap@flag.test',
      primaryPhone: null,
    };
    listRows = [vendor];
    api.getDirectoryRecord.mockResolvedValue({
      ...vendor,
      contactMethods: [
        {
          id: 'm1',
          type: 'email',
          value: 'ap@flag.test',
          labelId: 'l1',
          labelName: 'Billing',
          isPrimary: true,
        },
        {
          id: 'm2',
          type: 'phone',
          value: '+15125550100',
          labelId: null,
          labelName: null,
          isPrimary: false,
        },
      ],
      addresses: [
        {
          id: 'a1',
          line1: '1 Oak St',
          line2: null,
          city: 'Austin',
          region: 'TX',
          postalCode: '78701',
          country: 'US',
          labelId: 'l2',
          labelName: 'Location',
          isPrimary: true,
        },
      ],
      contacts: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          kind: 'vendor_contact',
          firstName: 'Rita',
          lastName: 'Moss',
          primaryEmail: 'rita@flag.test',
          primaryEmailLabel: 'Office',
          primaryPhone: null,
          primaryPhoneLabel: null,
          isPrimaryContact: true,
          isBillingContact: false,
          isPrimaryTaxContact: false,
          portalAccess: { status: 'off' },
        },
      ],
    });
    contactRows = (await api.getDirectoryRecord()).contacts;
    renderWithHeader(<DirectoryRecordsPage kind="vendor" />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Flag Supply LLC' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText('Email · Billing · primary')
    ).toBeTruthy();
    expect(
      within(
        within(dialog).getByRole('list', { name: 'Emails and phones' })
      ).getByText('Phone')
    ).toBeTruthy();
    // M0005-R034: a stored US phone shows in national form.
    expect(within(dialog).getByText('(512) 555-0100')).toBeTruthy();
    expect(
      within(dialog).getByText('Austin TX 78701 US · Location · primary')
    ).toBeTruthy();
    const contacts = within(dialog).getByRole('grid', { name: 'Contacts' });
    expect(
      await within(contacts).findByText('rita@flag.test (Office)')
    ).toBeTruthy();
    expect(within(contacts).getByText('Primary contact')).toBeTruthy();
  });
});

describe('Clients (M0005-R007)', () => {
  it('creates a home buyer client with its primary buyer', async () => {
    listRows = [];
    api.createDirectoryRecord.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'client',
      legalName: 'Lot 12',
      dbaName: null,
      taxIdLast4: null,
      archived: false,
      revision: 1,
      primaryEmail: null,
      primaryPhone: null,
    });
    api.getDirectoryRecord.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      kind: 'client',
      legalName: 'Lot 12',
      dbaName: null,
      taxIdLast4: null,
      archived: false,
      revision: 1,
      primaryEmail: null,
      primaryPhone: null,
      contactMethods: [],
      addresses: [],
      contacts: [],
    });
    renderWithHeader(<DirectoryRecordsPage kind="client" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'New client' }));
    const form = await screen.findByRole('dialog', { name: 'New client' });
    expect(within(form).queryByRole('combobox', { name: 'Kind' })).toBeNull();
    await user.type(
      within(form).getByLabelText(/Legal name or unit/),
      'Lot 12'
    );
    await user.type(within(form).getByLabelText(/Buyer first name/), 'Ann');
    await user.type(within(form).getByLabelText(/Buyer last name/), 'Smith');
    await user.type(within(form).getByLabelText(/Buyer tax ID/), '222-33-4444');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(api.createDirectoryRecord).toHaveBeenCalledWith('organizations', {
      kind: 'client',
      legalName: 'Lot 12',
      contacts: [
        {
          firstName: 'Ann',
          lastName: 'Smith',
          taxId: '222-33-4444',
          taxIdFormatId: SSN.id,
          isPrimaryTaxContact: true,
        },
      ],
    });
  });

  it('shows a load failure from the server', async () => {
    api.listDirectoryPage.mockRejectedValue(
      new ApiError('CELL_UNAVAILABLE', 503)
    );
    renderWithHeader(<DirectoryRecordsPage kind="client" />);
    expect(await screen.findByText(/database is unavailable/)).toBeTruthy();
  });
});

describe('Organization contacts (M0005-R004)', () => {
  it('creates a vendor contact with only a first and last name (M0005-R050)', async () => {
    api.createDirectoryRecord.mockResolvedValue({ id: 'saved' });
    const onSaved = vi.fn();
    // The dialog restores focus to whatever opened it; stand one in.
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    render(
      <ThemeModeProvider>
        <RecordFormDialog
          collection="organization-contacts"
          defaults={{ organizationId: 'org-1', organizationKind: 'vendor' }}
          canWriteTaxIds
          onClose={vi.fn()}
          onSaved={onSaved}
        />
      </ThemeModeProvider>
    );
    const form = await screen.findByRole('dialog', { name: 'New contact' });
    const user = userEvent.setup();
    await user.type(within(form).getByLabelText(/First name/), 'Rita');
    await user.type(within(form).getByLabelText(/Last name/), 'Moss');
    expect(within(form).queryByLabelText('Primary contact')).toBeNull();
    expect(within(form).queryByLabelText('Tax ID')).toBeNull();
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(api.createDirectoryRecord).toHaveBeenCalledWith(
      'organization-contacts',
      { organizationId: 'org-1', firstName: 'Rita', lastName: 'Moss' }
    );
    expect(onSaved).toHaveBeenCalledWith({ id: 'saved' });
    cleanup();
    opener.remove();
  });

  it("shows and toggles a contact's primary and billing flags on its detail (M0005-R051)", async () => {
    const rita = {
      id: '55555555-5555-4555-8555-555555555555',
      kind: 'vendor_contact',
      organizationId: '44444444-4444-4444-8444-444444444444',
      firstName: 'Rita',
      lastName: 'Moss',
      taxIdLast4: null,
      isPrimaryContact: true,
      isBillingContact: false,
      isPrimaryTaxContact: false,
      isPortalUser: false,
      portalAccess: { status: 'off', failureCode: null },
      archived: false,
      revision: 4,
      contactMethods: [],
      addresses: [],
    };
    api.getDirectoryRecord.mockResolvedValue(rita);
    api.updateDirectoryRecord.mockResolvedValue({ ...rita });
    // The dialog restores focus to whatever opened it; stand one in.
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    renderWithHeader(
      <RecordDetailDialog
        collection="organization-contacts"
        id={rita.id}
        abilities={{ write: true, readTaxIds: true, writeTaxIds: true }}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />
    );
    const dialog = await screen.findByRole('dialog', { name: /Rita Moss/ });
    const primary = within(dialog).getByLabelText('Primary contact');
    expect(primary.checked).toBe(true);
    expect(within(dialog).getByLabelText('Billing contact').checked).toBe(
      false
    );
    // R008: a vendor contact has no tax ID to edit.
    expect(
      within(dialog).queryByRole('button', { name: 'Edit tax ID' })
    ).toBeNull();
    await userEvent
      .setup()
      .click(within(dialog).getByLabelText('Billing contact'));
    expect(api.updateDirectoryRecord).toHaveBeenCalledWith(
      'organization-contacts',
      rita.id,
      { isBillingContact: true, revision: 4 }
    );
    cleanup();
    opener.remove();
  });
});

describe('Provision a tenant from a Napsoft client (I0006-R010)', () => {
  const ACME_BUILDERS = {
    id: '44444444-4444-4444-8444-444444444444',
    kind: 'client',
    legalName: 'Acme Builders',
    dbaName: null,
    taxIdLast4: '6789',
    archived: false,
    revision: 1,
    primaryEmail: null,
    primaryPhone: null,
    contactMethods: [],
    addresses: [],
    contacts: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        kind: 'client_contact',
        organizationId: '44444444-4444-4444-8444-444444444444',
        firstName: 'Rita',
        lastName: 'Moss',
        isPortalUser: false,
        portalAccess: { status: 'off', failureCode: null },
        isPrimaryContact: true,
        isBillingContact: true,
        isPrimaryTaxContact: false,
        taxIdLast4: null,
        archived: false,
        revision: 1,
        primaryEmail: 'rita@acme.test',
        primaryPhone: '555-0100',
      },
    ],
  };

  beforeEach(() => {
    useSession.mockReturnValue({
      selectedTenant: NAPSOFT_TENANT,
      capabilities: capabilitiesFixture(),
      refreshCapabilities: vi.fn(),
    });
    listRows = [ACME_BUILDERS];
    contactRows = ACME_BUILDERS.contacts;
    api.getDirectoryRecord.mockResolvedValue(ACME_BUILDERS);
    api.listCellsOverview.mockResolvedValue({
      rows: [
        { cell: { id: 'c1', database_name: 'nap_dev_cell_a' }, ready: true },
      ],
      nextCursor: null,
    });
  });

  it("shows the client's contacts and provisions a tenant with a contact as administrator", async () => {
    api.listClientTenants.mockResolvedValue([]);
    api.provisionTenant.mockResolvedValue({});
    renderWithHeader(<DirectoryRecordsPage kind="client" />);
    const user = userEvent.setup();
    const table = await screen.findByRole('grid', { name: 'Clients' });
    await user.click(
      await within(table).findByRole('button', { name: 'Acme Builders' })
    );
    const dialog = await screen.findByRole('dialog');
    const contacts = within(dialog).getByRole('grid', { name: 'Contacts' });
    expect(await within(contacts).findByText('rita@acme.test')).toBeTruthy();
    expect(
      within(contacts).getByText('Primary contact · Billing contact')
    ).toBeTruthy();
    expect(
      await within(dialog).findByRole('button', { name: 'Provision tenant' })
    ).toBeTruthy();
    expect(within(dialog).queryByText('Tenant: none')).toBeNull();
    expect(api.listClientTenants).toHaveBeenCalledWith(ACME_BUILDERS.id);

    await user.click(
      within(dialog).getByRole('button', { name: 'Provision tenant' })
    );
    const form = await screen.findByRole('dialog', {
      name: 'Provision tenant for Acme Builders',
    });
    expect(within(form).getByLabelText(/^Name/).value).toBe('Acme Builders');
    await user.type(within(form).getByLabelText(/^Code/), 'acme');
    await user.click(
      within(form).getByRole('combobox', {
        name: 'Administrator from contacts',
      })
    );
    await user.click(
      await screen.findByRole('option', { name: 'Rita Moss · rita@acme.test' })
    );
    await user.type(
      within(form).getByLabelText(/Temporary password/),
      'temporary'
    );
    await user.click(within(form).getByRole('button', { name: 'Provision' }));
    expect(api.provisionTenant).toHaveBeenCalledWith({
      client: ACME_BUILDERS.id,
      code: 'acme',
      name: 'Acme Builders',
      tier: 'starter',
      cell: 'c1',
      firstName: 'Rita',
      lastName: 'Moss',
      email: 'rita@acme.test',
      password: 'temporary',
    });
  });

  it.each([
    [{ field: 'code' }, 'Another tenant uses this code.'],
    [{ field: 'client' }, 'This client already has a tenant.'],
    [{ field: 'email' }, 'This email belongs to a login that cannot be used.'],
    [undefined, 'Another change got there first. Try again.'],
  ])(
    'names the taken value on a conflict (%o), with no helper text unless the code is invalid (I0006-R022, R023)',
    async (details, message) => {
      api.listClientTenants.mockResolvedValue([]);
      api.provisionTenant.mockRejectedValue(
        new ApiError('CONFLICT', 409, null, { details })
      );
      renderWithHeader(<DirectoryRecordsPage kind="client" />);
      const user = userEvent.setup();
      const table = await screen.findByRole('grid', { name: 'Clients' });
      await user.click(
        await within(table).findByRole('button', { name: 'Acme Builders' })
      );
      const dialog = await screen.findByRole('dialog');
      await user.click(
        await within(dialog).findByRole('button', { name: 'Provision tenant' })
      );
      const form = await screen.findByRole('dialog', {
        name: 'Provision tenant for Acme Builders',
      });
      expect(form.querySelector('.MuiFormHelperText-root')).toBeNull();
      const code = within(form).getByLabelText(/^Code/);
      await user.type(code, '9x');
      expect(
        within(form).getByText(
          'Use letters, digits, and _, starting with a letter.'
        )
      ).toBeTruthy();
      await user.clear(code);
      await user.type(code, 'acme');
      await user.type(within(form).getByLabelText(/^First name/), 'Rita');
      await user.type(within(form).getByLabelText(/^Last name/), 'Moss');
      await user.type(
        within(form).getByLabelText(/Administrator email/),
        'rita@acme.test'
      );
      await user.type(
        within(form).getByLabelText(/Temporary password/),
        'temporary'
      );
      await user.click(within(form).getByRole('button', { name: 'Provision' }));
      expect(await within(form).findByText(message)).toBeTruthy();
    }
  );

  it('shows the existing tenant instead of the Provision action', async () => {
    api.listClientTenants.mockResolvedValue([
      { code: 'ACME', provisioned: true, job: null },
    ]);
    renderWithHeader(<DirectoryRecordsPage kind="client" />);
    const user = userEvent.setup();
    const table = await screen.findByRole('grid', { name: 'Clients' });
    await user.click(
      await within(table).findByRole('button', { name: 'Acme Builders' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText('Tenant: ACME · provisioned')
    ).toBeTruthy();
    expect(
      within(dialog).queryByRole('button', { name: 'Provision tenant' })
    ).toBeNull();
  });

  it('hides the tenant panel outside the Napsoft tenant', async () => {
    useSession.mockReturnValue(sessionFor());
    renderWithHeader(<DirectoryRecordsPage kind="client" />);
    const user = userEvent.setup();
    const table = await screen.findByRole('grid', { name: 'Clients' });
    await user.click(
      await within(table).findByRole('button', { name: 'Acme Builders' })
    );
    await screen.findByRole('dialog');
    expect(screen.queryByText(/^Tenant:/)).toBeNull();
    expect(api.listClientTenants).not.toHaveBeenCalled();
  });
});

describe('Labels (M0005-R017, R031, R032)', () => {
  const label = (id, appliesTo, name, revision = 1) => ({
    id,
    appliesTo,
    name,
    archived: false,
    revision,
  });
  const WORK = label('44444444-4444-4444-8444-444444444444', 'email', 'work');
  const HOME = label(
    '55555555-5555-4555-8555-555555555555',
    'email',
    'home',
    2
  );
  const MOBILE = label(
    '66666666-6666-4666-8666-666666666666',
    'phone',
    'mobile'
  );

  beforeEach(() => {
    api.listContactLabels.mockResolvedValue([WORK, HOME, MOBILE]);
  });

  async function labelsGrid() {
    renderWithHeader(<LabelsPage />);
    const table = await screen.findByRole('grid', { name: 'Labels' });
    await within(table).findByText('work');
    return table;
  }

  it('adds a label in a dialog and reports a duplicate name there', async () => {
    api.createContactLabel.mockRejectedValue(new ApiError('CONFLICT', 409));
    await labelsGrid();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'New label' }));
    const dialog = await screen.findByRole('dialog', { name: 'New label' });
    await user.type(within(dialog).getByLabelText(/Name/), 'work');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(api.createContactLabel).toHaveBeenCalledWith({
      appliesTo: 'email',
      name: 'work',
    });
    expect(await within(dialog).findByText(/already used/)).toBeTruthy();
  });

  it('links an archived-name refusal to the Archived view searched for it (I0011-R008)', async () => {
    api.createContactLabel.mockRejectedValue(
      new ApiError('CONFLICT', 409, null, {
        details: { id: WORK.id, archived: true },
      })
    );
    await labelsGrid();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'New label' }));
    const dialog = await screen.findByRole('dialog', { name: 'New label' });
    await user.type(within(dialog).getByLabelText(/Name/), 'gone');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText(
        /An archived label already uses this name/
      )
    ).toBeTruthy();
    await user.click(
      within(dialog).getByRole('link', { name: 'Show it in Archived' })
    );
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'New label' })).toBeNull()
    );
    expect(
      screen
        .getByRole('tab', { name: 'Archived' })
        .getAttribute('aria-selected')
    ).toBe('true');
    expect(screen.getByLabelText('Search by name').value).toBe('gone');
    expect(api.listContactLabels).toHaveBeenLastCalledWith({
      appliesTo: undefined,
      archived: true,
    });
    expect(screen.queryByRole('button', { name: 'New label' })).toBeNull();
  });

  it('offers Edit then Archive in the row menu, and edits in a dialog with For as text (M0005-R056, R057)', async () => {
    api.renameContactLabel.mockResolvedValue({ ...WORK, name: 'office' });
    const table = await labelsGrid();
    const user = userEvent.setup();
    const row = within(table).getByText('work').closest('[role="row"]');
    await user.click(within(row).getByRole('menuitem', { name: 'more' }));
    const items = (await screen.findAllByRole('menuitem'))
      .map(item => item.textContent)
      .filter(text => ['Edit', 'Archive'].includes(text));
    expect(items).toEqual(['Edit', 'Archive']);
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit label' });
    expect(within(dialog).getByText('For: Email')).toBeTruthy();
    expect(within(dialog).queryByLabelText('For')).toBeNull();
    const name = within(dialog).getByLabelText(/Name/);
    await user.clear(name);
    await user.type(name, 'office');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(api.renameContactLabel).toHaveBeenCalledWith(WORK.id, {
      name: 'office',
      revision: 1,
    });
    expect(await screen.findByText('office saved.')).toBeTruthy();
  });

  it('reloads a stale rename into the dialog and retries with its revision', async () => {
    api.renameContactLabel.mockRejectedValueOnce(
      new ApiError('STALE_REVISION', 409)
    );
    await labelsGrid();
    const user = userEvent.setup();
    const row = screen.getByText('work').closest('[role="row"]');
    await user.click(within(row).getByRole('menuitem', { name: 'more' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit label' });
    const changed = { ...WORK, name: 'office', revision: 2 };
    api.listContactLabels.mockImplementation(async ({ archived }) =>
      archived ? [] : [changed, HOME]
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByDisplayValue('office')).toBeTruthy();
    expect(api.listContactLabels).toHaveBeenCalledWith({
      appliesTo: 'email',
      archived: true,
    });
    api.renameContactLabel.mockResolvedValueOnce(changed);
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(api.renameContactLabel).toHaveBeenLastCalledWith(WORK.id, {
      name: 'office',
      revision: 2,
    });
  });

  it('searches by name and filters by group in the header (I0001-R029)', async () => {
    const table = await labelsGrid();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Search by name'), 'mob');
    await vi.waitFor(() =>
      expect(within(table).queryByText('work')).toBeNull()
    );
    expect(within(table).getByText('mobile')).toBeTruthy();
    expect(api.listContactLabels).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    await user.click(screen.getByLabelText('For'));
    await user.click(await screen.findByRole('option', { name: 'Phone' }));
    expect(api.listContactLabels).toHaveBeenLastCalledWith({
      appliesTo: 'phone',
      archived: false,
    });
    await user.keyboard('{Escape}');
    expect(screen.getByText('For: Phone')).toBeTruthy();
  });

  it('archives the selected labels in one request (R032)', async () => {
    api.bulkContactLabelAction.mockResolvedValue([]);
    await labelsGrid();
    const user = userEvent.setup();
    const boxes = screen.getAllByRole('checkbox', { name: /select row/i });
    await user.click(boxes[0]);
    await user.click(boxes[1]);
    await user.click(
      screen.getByRole('button', { name: 'Archive selected (2)' })
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Archive 2 labels?',
    });
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    expect(api.bulkContactLabelAction).toHaveBeenCalledWith('archive', [
      { id: WORK.id, revision: 1 },
      { id: HOME.id, revision: 2 },
    ]);
    expect(await screen.findByText('2 labels archived.')).toBeTruthy();
  });

  it('hides Add label, checkboxes, and row menus without labels::write', async () => {
    useSession.mockReturnValue(
      sessionFor(['ACME::business-directory::directory::read'])
    );
    await labelsGrid();
    expect(screen.queryByRole('button', { name: 'New label' })).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.queryAllByRole('menuitem', { name: 'more' })).toHaveLength(0);
  });
});

describe('Grid row menu and bulk actions (M0005-R028–R030)', () => {
  const BOB = {
    ...JANE,
    id: '22222222-2222-4222-8222-222222222222',
    firstName: 'Bob',
    lastName: 'Ray',
    isPortalUser: false,
    portalAccess: { status: 'off', failureCode: null },
    taxIdLast4: null,
  };
  const OLD = {
    ...BOB,
    id: '33333333-3333-4333-8333-333333333333',
    firstName: 'Old',
    lastName: 'Timer',
    archived: true,
  };

  async function grid() {
    const table = await screen.findByRole('grid', { name: 'Employees' });
    await within(table).findByText('Jane Doe');
    return table;
  }

  it('offers Edit and Archive on active rows and Restore on archived ones', async () => {
    listRows = [JANE, OLD];
    api.archiveDirectoryRecord.mockResolvedValue({ ...JANE, archived: true });
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    await grid();
    const user = userEvent.setup();
    const menus = screen.getAllByRole('menuitem', { name: 'more' });
    await user.click(menus[0]);
    expect(await screen.findByRole('menuitem', { name: 'Edit' })).toBeTruthy();
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
    const confirm = await screen.findByRole('dialog');
    expect(
      within(confirm).getByText('Archived records move to the Archived tab.')
    ).toBeTruthy();
    await user.click(within(confirm).getByRole('button', { name: 'Archive' }));
    expect(api.archiveDirectoryRecord).toHaveBeenCalledWith(
      'people',
      JANE.id,
      JANE.revision
    );
    await user.keyboard('{Escape}');
    await user.click(screen.getAllByRole('menuitem', { name: 'more' })[1]);
    expect(
      await screen.findByRole('menuitem', { name: 'Restore' })
    ).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Archive' })).toBeNull();
  });

  it("opens the record's detail from the row menu's Edit (M0005-R049)", async () => {
    listRows = [JANE];
    api.getDirectoryRecord.mockResolvedValue({
      ...JANE,
      contactMethods: [],
      addresses: [],
    });
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    await grid();
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('menuitem', { name: 'more' })[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const detail = await screen.findByRole('dialog', { name: /Jane Doe/ });
    expect(
      within(detail).getByRole('button', { name: 'Edit name' })
    ).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Edit employee' })).toBeNull();
  });

  it('hides the row menu without directory::write', async () => {
    useSession.mockReturnValue(
      sessionFor(['ACME::business-directory::directory::read'])
    );
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    await grid();
    expect(screen.queryAllByRole('menuitem', { name: 'more' })).toHaveLength(0);
  });

  it('archives the selected rows in one request', async () => {
    listRows = [JANE, BOB];
    api.bulkDirectoryAction.mockResolvedValue([]);
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    await grid();
    const user = userEvent.setup();
    const boxes = screen.getAllByRole('checkbox', { name: /select row/i });
    await user.click(boxes[0]);
    await user.click(boxes[1]);
    expect(
      screen.queryByRole('button', { name: /Restore selected/ })
    ).toBeNull();
    // I0001-R028: in the header, left of the create action.
    const header = screen.getByRole('heading', {
      name: 'Employees',
    }).parentElement;
    expect(
      within(header)
        .getAllByRole('button')
        .map(button => button.textContent)
        .slice(-2)
    ).toEqual(['Archive selected (2)', 'New employee']);
    await user.click(
      screen.getByRole('button', { name: 'Archive selected (2)' })
    );
    const confirm = await screen.findByRole('dialog', {
      name: 'Archive 2 employees?',
    });
    expect(
      within(confirm).getByText('Archived records move to the Archived tab.')
    ).toBeTruthy();
    await user.click(within(confirm).getByRole('button', { name: 'Archive' }));
    expect(api.bulkDirectoryAction).toHaveBeenCalledWith('people', 'archive', [
      { id: JANE.id, revision: JANE.revision },
      { id: BOB.id, revision: BOB.revision },
    ]);
  });

  it('lists each record a bulk archive refused and keeps the selection', async () => {
    listRows = [JANE, BOB];
    api.bulkDirectoryAction.mockRejectedValue(
      new ApiError('BULK_FAILED', 409, null, {
        details: [{ id: JANE.id, code: 'ADMIN_ASSIGNED' }],
      })
    );
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    await grid();
    const user = userEvent.setup();
    const boxes = screen.getAllByRole('checkbox', { name: /select row/i });
    await user.click(boxes[0]);
    await user.click(boxes[1]);
    await user.click(
      screen.getByRole('button', { name: 'Archive selected (2)' })
    );
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Archive',
      })
    );
    const failure = await screen.findByRole('dialog', {
      name: 'Nothing was changed',
    });
    expect(
      within(failure).getByText(
        /Jane Doe: This person holds an administrator role/
      )
    ).toBeTruthy();
    await user.click(within(failure).getByRole('button', { name: 'Close' }));
    expect(
      screen.getByRole('button', { name: 'Archive selected (2)' })
    ).toBeTruthy();
  });

  it('offers only Restore selected in the Archived view, opened from the URL (I0011-R003, R005)', async () => {
    listRows = [OLD];
    renderWithHeader(
      <DirectoryRecordsPage kind="employee" />,
      '/directory/employees?view=archived'
    );
    await within(
      await screen.findByRole('grid', { name: 'Employees' })
    ).findByText('Old Timer');
    expect(
      screen
        .getByRole('tab', { name: 'Archived' })
        .getAttribute('aria-selected')
    ).toBe('true');
    expect(api.listDirectoryPage).toHaveBeenLastCalledWith(
      'people',
      expect.objectContaining({ archived: true })
    );
    expect(screen.queryByRole('button', { name: 'New employee' })).toBeNull();
    const user = userEvent.setup();
    await user.click(
      screen.getAllByRole('checkbox', { name: /select row/i })[0]
    );
    expect(
      screen.getByRole('button', { name: 'Restore selected (1)' })
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Archive selected/ })
    ).toBeNull();
  });
});

describe('Tax ID formats (M0005-R036–R042)', () => {
  const VAT = {
    id: '5c5c5c5c-5c5c-4c5c-8c5c-5c5c5c5c5c5c',
    country: 'GB',
    name: 'VAT',
    mask: 'GB ### #### ##',
    archived: true,
    revision: 2,
  };

  beforeEach(() => {
    api.listTaxIdFormats.mockResolvedValue([SSN, EIN, VAT]);
  });

  async function formatsGrid(entry) {
    renderWithHeader(<TaxIdFormatsPage />, entry);
    const table = await screen.findByRole('grid', { name: 'Tax ID formats' });
    await within(table).findByText('SSN');
    return table;
  }

  it('lists active formats with their masks, and archived ones on the Archived tab', async () => {
    const table = await formatsGrid();
    expect(within(table).getByText('###-##-####')).toBeTruthy();
    expect(within(table).getByText('EIN')).toBeTruthy();
    expect(within(table).queryByText('VAT')).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Archived' }));
    expect(await within(table).findByText('VAT')).toBeTruthy();
    expect(within(table).queryByText('SSN')).toBeNull();
  });

  it('adds a format, explaining the mask only while it is invalid', async () => {
    api.createTaxIdFormat.mockResolvedValue({
      ...VAT,
      id: '5d5d5d5d-5d5d-4d5d-8d5d-5d5d5d5d5d5d',
      country: 'US',
      name: 'PTIN',
      mask: 'P########',
      archived: false,
      revision: 1,
    });
    await formatsGrid();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'New format' }));
    const dialog = await screen.findByRole('dialog', { name: 'New format' });
    await user.type(within(dialog).getByLabelText(/Name/), 'PTIN');
    const mask = within(dialog).getByLabelText(/Mask/);
    await user.type(mask, '##');
    expect(within(dialog).getByRole('button', { name: 'Save' }).disabled).toBe(
      true
    );
    // M0005-R059: helper text only while the mask is invalid.
    expect(within(dialog).getByText(/# is a digit/)).toBeTruthy();
    await user.clear(mask);
    await user.type(mask, 'P########');
    expect(within(dialog).queryByText(/# is a digit/)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(api.createTaxIdFormat).toHaveBeenCalledWith({
      country: 'US',
      name: 'PTIN',
      mask: 'P########',
    });
    expect(await screen.findByText('PTIN created.')).toBeTruthy();
  });

  it('explains a refused slot change to a format in use (R041)', async () => {
    api.updateTaxIdFormat.mockRejectedValue(new ApiError('INVALID_STATE', 409));
    const table = await formatsGrid();
    const user = userEvent.setup();
    const row = within(table).getByText('SSN').closest('[role="row"]');
    await user.click(within(row).getByRole('menuitem', { name: 'more' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit format' });
    const mask = within(dialog).getByLabelText(/Mask/);
    await user.clear(mask);
    await user.type(mask, '##-####');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(api.updateTaxIdFormat).toHaveBeenCalledWith(SSN.id, {
      name: 'SSN',
      mask: '##-####',
      revision: 1,
    });
    expect(
      await within(dialog).findByText(/only its name and separators can change/)
    ).toBeTruthy();
  });

  it('hides write actions without tax-id-formats::write', async () => {
    useSession.mockReturnValue(
      sessionFor(['ACME::business-directory::directory::read'])
    );
    const table = await formatsGrid();
    expect(screen.queryByRole('button', { name: 'New format' })).toBeNull();
    expect(within(table).queryByRole('menuitem', { name: 'more' })).toBeNull();
  });
});

describe('Consistent patterns (M0005-R054–R062)', () => {
  const OLD = {
    ...STAFF,
    id: '33333333-3333-4333-8333-333333333333',
    firstName: 'Old',
    lastName: 'Timer',
    archived: true,
  };
  const GB = {
    defaultCountry: 'GB',
    currency: 'GBP',
    timeZone: 'Europe/London',
    dateFormat: 'DD/MM/YYYY',
    language: 'en',
    recordsPerPage: 25,
  };

  it('AC36, AC37: archives a row after "Archive employee?" and restores one without asking, each with a notice', async () => {
    listRows = [STAFF, OLD];
    api.archiveDirectoryRecord.mockResolvedValue({ ...STAFF, archived: true });
    api.restoreDirectoryRecord.mockResolvedValue({ ...OLD, archived: false });
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const table = await screen.findByRole('grid', { name: 'Employees' });
    await within(table).findByText('Jane Doe');
    const user = userEvent.setup();
    await user.click(screen.getAllByRole('menuitem', { name: 'more' })[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    const confirm = await screen.findByRole('dialog', {
      name: 'Archive employee?',
    });
    await user.click(within(confirm).getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText('Jane Doe archived.')).toBeTruthy();

    await user.click(screen.getAllByRole('menuitem', { name: 'more' })[1]);
    await user.click(await screen.findByRole('menuitem', { name: 'Restore' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.restoreDirectoryRecord).toHaveBeenCalledWith(
      'people',
      OLD.id,
      OLD.revision
    );
    expect(await screen.findByText('Old Timer restored.')).toBeTruthy();
  });

  it('AC36, AC38, AC41: the detail has no kind chip, names New email, phone, and address, and asks before a remove or an archive', async () => {
    listRows = [STAFF];
    api.getDirectoryRecord.mockResolvedValue({
      ...STAFF,
      contactMethods: [
        {
          id: 'm1',
          type: 'email',
          value: 'jane@acme.test',
          isPrimary: false,
          archived: false,
        },
      ],
      addresses: [],
    });
    api.removeContactMethod.mockResolvedValue();
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Jane Doe' }));
    const detail = await screen.findByRole('dialog', { name: /Jane Doe/ });
    expect(within(detail).queryByText('Employee')).toBeNull();
    for (const name of ['New email', 'New phone', 'New address'])
      expect(within(detail).getByRole('button', { name })).toBeTruthy();

    await user.click(
      within(detail).getByRole('button', { name: 'Remove jane@acme.test' })
    );
    expect(api.removeContactMethod).not.toHaveBeenCalled();
    const remove = await screen.findByRole('dialog', { name: 'Remove email?' });
    await user.click(within(remove).getByRole('button', { name: 'Remove' }));
    expect(api.removeContactMethod).toHaveBeenCalledWith(STAFF.id, 'm1');

    await user.click(within(detail).getByRole('button', { name: 'Archive' }));
    const archive = await screen.findByRole('dialog', {
      name: 'Archive employee?',
    });
    expect(
      within(archive).getByText('Archived records move to the Archived tab.')
    ).toBeTruthy();
  });

  it('AC41: an empty list says why, by view and search (M0005-R062)', async () => {
    listRows = [];
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    expect(await screen.findByText('No employees yet.')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Archived' }));
    expect(await screen.findByText('No archived employees.')).toBeTruthy();
    await user.type(screen.getByLabelText('Search by name'), 'zed');
    expect(await screen.findByText('No employees match.')).toBeTruthy();
  });

  it('AC37: a create shows a notice (M0005-R055)', async () => {
    api.createDirectoryRecord.mockResolvedValue({ ...STAFF });
    api.getDirectoryRecord.mockResolvedValue({
      ...STAFF,
      contactMethods: [],
      addresses: [],
    });
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'New employee' })
    );
    const form = await screen.findByRole('dialog', { name: 'New employee' });
    await user.type(within(form).getByLabelText(/First name/), 'Jane');
    await user.type(within(form).getByLabelText(/Last name/), 'Doe');
    await user.type(within(form).getByLabelText(/Primary email/), 'j@a.test');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Jane Doe created.')).toBeTruthy();
  });

  it('AC40: a refused vendor create names its tax ID (M0005-R060)', async () => {
    api.createDirectoryRecord.mockRejectedValue(
      new ApiError('INVALID_INPUT', 400)
    );
    // The dialog returns focus to its opener when it closes.
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    renderWithHeader(
      <RecordFormDialog
        collection="organizations"
        defaults={{ kind: 'vendor' }}
        canWriteTaxIds
        onClose={() => {}}
        onSaved={() => {}}
      />
    );
    const user = userEvent.setup();
    const vendor = await screen.findByRole('dialog', { name: 'New vendor' });
    await user.type(within(vendor).getByLabelText(/Legal name/), 'Pine');
    await user.type(
      within(vendor).getByRole('textbox', { name: /^Tax ID/ }),
      '12-3456789'
    );
    await user.click(within(vendor).getByRole('button', { name: 'Save' }));
    expect(
      await within(vendor).findByText('A vendor needs a tax ID.')
    ).toBeTruthy();
    cleanup();
    opener.remove();
  });

  /** M0005-R058: the tenant's default country is GB. */
  function inGB(element) {
    api.getEffectiveSettings.mockResolvedValue(GB);
    api.listCountries.mockResolvedValue([
      { code: 'GB', alpha3: 'GBR', numericCode: '826', name: 'United Kingdom' },
      { code: 'US', alpha3: 'USA', numericCode: '840', name: 'United States' },
    ]);
    renderWithHeader(
      <EffectiveSettingsProvider tenantId={TENANT.id}>
        {element}
      </EffectiveSettingsProvider>
    );
  }

  it('AC39: a new address starts at the tenant country', async () => {
    api.getDirectoryRecord.mockResolvedValue({
      ...STAFF,
      contactMethods: [],
      addresses: [],
    });
    inGB(<DirectoryRecordsPage kind="employee" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Jane Doe' }));
    const detail = await screen.findByRole('dialog', { name: /Jane Doe/ });
    await user.click(
      within(detail).getByRole('button', { name: 'New address' })
    );
    const address = await screen.findByRole('dialog', { name: 'New address' });
    expect(
      await within(address).findByDisplayValue('United Kingdom (GB)')
    ).toBeTruthy();
  });

  it('AC39: a new format starts at the tenant country; an edited one shows its country as text', async () => {
    inGB(<TaxIdFormatsPage />);
    const table = await screen.findByRole('grid', { name: 'Tax ID formats' });
    await within(table).findByText('SSN');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'New format' }));
    const format = await screen.findByRole('dialog', { name: 'New format' });
    expect(
      await within(format).findByDisplayValue('United Kingdom (GB)')
    ).toBeTruthy();
    await user.click(within(format).getByRole('button', { name: 'Cancel' }));

    await user.click(screen.getAllByRole('menuitem', { name: 'more' })[0]);
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit format' });
    expect(within(edit).getByText('Country: US')).toBeTruthy();
    expect(within(edit).queryByLabelText(/Country/)).toBeNull();
  });
});

describe('Duplicate emails, phones, and addresses (M0005-R064)', () => {
  it('AC42: each dialog names what is already on the record', async () => {
    listRows = [STAFF];
    api.getDirectoryRecord.mockResolvedValue({
      ...STAFF,
      contactMethods: [],
      addresses: [],
    });
    const duplicate = () => new ApiError('DUPLICATE_DETAIL', 409, null);
    api.addContactMethod.mockRejectedValue(duplicate());
    api.addAddress.mockRejectedValue(duplicate());
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Jane Doe' }));
    const detail = await screen.findByRole('dialog', { name: /Jane Doe/ });
    for (const [button, field, value, message] of [
      ['New email', 'Email', 'jane@example.test', 'email'],
      ['New phone', 'Phone', '212 555 1234', 'phone'],
      ['New address', 'Address line 1', '1 Oak St', 'address'],
    ]) {
      await user.click(within(detail).getByRole('button', { name: button }));
      const dialog = await screen.findByRole('dialog', { name: button });
      await user.type(within(dialog).getByLabelText(new RegExp(field)), value);
      if (button === 'New address')
        await user.type(within(dialog).getByLabelText(/City/), 'Austin');
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));
      expect(
        await within(dialog).findByText(
          `This record already has this ${message}.`
        )
      ).toBeTruthy();
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    }
  });
});

describe('Emails, phones, and addresses on other records (M0005-R065–R067)', () => {
  const VENDOR_ID = '55555555-5555-4555-8555-555555555555';
  const MATCHES = [
    {
      id: '66666666-6666-4666-8666-666666666666',
      kind: 'employee',
      name: 'Pat Doe',
      archived: false,
      organization: null,
    },
    {
      id: '77777777-7777-4777-8777-777777777777',
      kind: 'contact',
      name: 'Old Pat',
      archived: true,
      organization: null,
    },
    {
      id: '88888888-8888-4888-8888-888888888888',
      kind: 'vendor_contact',
      name: 'Pat Roe',
      archived: false,
      organization: { id: VENDOR_ID, name: 'Acme Supply', archived: false },
    },
  ];

  async function openNew(button) {
    listRows = [STAFF];
    api.getDirectoryRecord.mockResolvedValue({
      ...STAFF,
      contactMethods: [],
      addresses: [],
    });
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Jane Doe' }));
    const detail = await screen.findByRole('dialog', { name: /Jane Doe/ });
    await user.click(within(detail).getByRole('button', { name: button }));
    return {
      user,
      dialog: await screen.findByRole('dialog', { name: button }),
    };
  }

  it('AC44, AC45: lists other records with links, then Save anyway saves', async () => {
    api.findDetailMatches.mockResolvedValue({ matches: MATCHES });
    api.addContactMethod.mockResolvedValue({});
    const { user, dialog } = await openNew('New email');
    await user.type(within(dialog).getByLabelText(/Email/), 'pat@example.test');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/Also on:/)).toBeTruthy();
    expect(api.findDetailMatches).toHaveBeenCalledWith(STAFF.id, {
      type: 'email',
      value: 'pat@example.test',
    });
    expect(api.addContactMethod).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText(/Pat Roe \(Vendor contact at Acme Supply\)/)
    ).toBeTruthy();
    expect(
      within(dialog).getByText(/Old Pat \(Contact\) · Archived/)
    ).toBeTruthy();
    expect(
      within(dialog)
        .getAllByRole('link', { name: 'Open' })
        .map(link => link.getAttribute('href'))
    ).toEqual([
      `/directory/employees?open=${MATCHES[0].id}`,
      `/directory/contacts?view=archived&open=${MATCHES[1].id}`,
      `/directory/vendors?open=${VENDOR_ID}`,
    ]);
    await user.click(
      within(dialog).getByRole('button', { name: 'Save anyway' })
    );
    await vi.waitFor(() => expect(api.addContactMethod).toHaveBeenCalled());
    expect(api.findDetailMatches).toHaveBeenCalledTimes(1);
  });

  it('AC46: saves in one press with no matches, and a change hides the warning', async () => {
    api.addAddress.mockResolvedValue({});
    const { user, dialog } = await openNew('New address');
    await user.type(
      within(dialog).getByLabelText(/Address line 1/),
      '1 Oak St'
    );
    await user.type(within(dialog).getByLabelText(/City/), 'Austin');
    api.findDetailMatches.mockResolvedValueOnce({ matches: MATCHES });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/Also on:/)).toBeTruthy();
    expect(api.findDetailMatches).toHaveBeenLastCalledWith(STAFF.id, {
      type: 'address',
      line1: '1 Oak St',
      line2: null,
      city: 'Austin',
      region: null,
      postalCode: null,
      country: 'US',
    });
    await user.type(within(dialog).getByLabelText(/Address line 1/), 'reet');
    expect(within(dialog).queryByText(/Also on:/)).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => expect(api.addAddress).toHaveBeenCalled());
  });
});
