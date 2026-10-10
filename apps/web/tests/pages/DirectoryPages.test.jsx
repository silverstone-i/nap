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
import { RecordFormDialog } from '../../src/pages/directory/RecordFormDialog.jsx';
import { ContextualActionHeader } from '../../src/shell/ContextualActionHeader.jsx';
import { PageHeaderProvider } from '../../src/shell/PageHeaderContext.jsx';
import { ThemeModeProvider } from '../../src/theme/ThemeModeContext.jsx';
import { MemoryRouter } from 'react-router';
import {
  NAPSOFT_TENANT,
  capabilitiesFixture,
  installMatchMedia,
} from '../testUtils.jsx';

vi.mock('../../src/api/endpoints.js', () => ({
  listDirectoryRecords: vi.fn(),
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
  listContactLabels: vi.fn(),
  listRoles: vi.fn(),
  createContactLabel: vi.fn(),
  renameContactLabel: vi.fn(),
  archiveContactLabel: vi.fn(),
  restoreContactLabel: vi.fn(),
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

const JANE = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'employee',
  firstName: 'Jane',
  lastName: 'Doe',
  taxIdLast4: '6789',
  isPortalUser: true,
  portalAccess: { status: 'on', failureCode: null },
  archived: false,
  revision: 2,
  primaryEmail: 'jane@acme.test',
  primaryPhone: null,
};

function renderWithHeader(element) {
  return render(
    <MemoryRouter>
      <ThemeModeProvider>
        <PageHeaderProvider>
          <ContextualActionHeader />
          {element}
        </PageHeaderProvider>
      </ThemeModeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  installMatchMedia();
  useSession.mockReturnValue(sessionFor());
  api.listDirectoryRecords.mockResolvedValue([JANE]);
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

describe('Employees (M0005-R026)', () => {
  it('lists employees with masked tax IDs and reveals one on request', async () => {
    api.revealTaxId.mockResolvedValue('123456789');
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const table = await screen.findByRole('table', { name: 'Employees' });
    expect(api.listDirectoryRecords).toHaveBeenCalledWith(
      'people',
      expect.objectContaining({ kind: 'employee' })
    );
    expect(within(table).getByText('•••••6789')).toBeTruthy();
    expect(within(table).queryByText('123456789')).toBeNull();
    expect(within(table).getByText('On')).toBeTruthy();

    const user = userEvent.setup();
    await user.click(within(table).getByRole('button', { name: 'Jane Doe' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Reveal' }));
    expect(await within(dialog).findByText('Tax ID: 123456789')).toBeTruthy();
    expect(api.revealTaxId).toHaveBeenCalledWith('people', JANE.id);
  });

  it('hides tax ID search, reveal, and entry without the tax ID capabilities', async () => {
    useSession.mockReturnValue(sessionFor(NO_TAX));
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    await screen.findByRole('table', { name: 'Employees' });
    expect(screen.queryByLabelText('Search by tax ID')).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Jane Doe' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByRole('button', { name: 'Reveal' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: 'Edit' }));
    const form = await screen.findByRole('dialog', { name: 'Edit employee' });
    expect(within(form).queryByLabelText(/SSN/)).toBeNull();
  });

  it('creates an employee with a primary email and warns about a duplicate tax ID', async () => {
    api.createDirectoryRecord.mockResolvedValue({
      ...JANE,
      duplicateTaxIds: ['22222222-2222-4222-8222-222222222222'],
    });
    renderWithHeader(<DirectoryRecordsPage kind="employee" />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'New employee' })
    );
    const form = await screen.findByRole('dialog', { name: 'New employee' });
    await user.type(within(form).getByLabelText(/First name/), 'Jane');
    await user.type(within(form).getByLabelText(/Last name/), 'Doe');
    await user.type(
      within(form).getByLabelText(/Primary email/),
      'jane@acme.test'
    );
    await user.type(within(form).getByLabelText(/SSN/), '123-45-6789');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(api.createDirectoryRecord).toHaveBeenCalledWith('people', {
      kind: 'employee',
      firstName: 'Jane',
      lastName: 'Doe',
      isPortalUser: false,
      primaryEmail: 'jane@acme.test',
      taxId: '123-45-6789',
    });
    expect(
      await screen.findByText(/1 other record\(s\) have the same tax ID/)
    ).toBeTruthy();
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

  it('asks for a temporary password when access is turned on', async () => {
    api.updateDirectoryRecord.mockResolvedValue({ ...JANE });
    const off = {
      ...JANE,
      isPortalUser: false,
      portalAccess: { status: 'off', failureCode: null },
    };
    render(
      <ThemeModeProvider>
        <RecordFormDialog
          collection="people"
          record={off}
          canWriteTaxIds={false}
          canManagePortal
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </ThemeModeProvider>
    );
    const form = await screen.findByRole('dialog', { name: 'Edit employee' });
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
      firstName: 'Jane',
      lastName: 'Doe',
      isPortalUser: true,
      temporaryPassword: 'temp-pass',
      roleIds: [CLERK.id],
      revision: 2,
    });
  });

  it('hides portal access and roles without the right to assign roles (I0010-R001)', async () => {
    render(
      <ThemeModeProvider>
        <RecordFormDialog
          collection="people"
          record={JANE}
          canWriteTaxIds={false}
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </ThemeModeProvider>
    );
    const form = await screen.findByRole('dialog', { name: 'Edit employee' });
    expect(within(form).queryByLabelText('Portal access')).toBeNull();
    expect(within(form).queryByLabelText('Roles')).toBeNull();
  });

  it('sends the new role set when roles change while access stays on (I0010-R009)', async () => {
    api.updateDirectoryRecord.mockResolvedValue({ ...JANE });
    render(
      <ThemeModeProvider>
        <RecordFormDialog
          collection="people"
          record={{
            ...JANE,
            roles: [{ id: CLERK.id, code: 'clerk', name: 'Clerk', held: true }],
          }}
          canWriteTaxIds={false}
          canManagePortal
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </ThemeModeProvider>
    );
    const form = await screen.findByRole('dialog', { name: 'Edit employee' });
    expect(
      within(form).getByText('Applies when this person first signs in.')
    ).toBeTruthy();
    const user = userEvent.setup();
    await user.click(within(form).getByLabelText('Roles'));
    await user.click(await screen.findByRole('option', { name: 'Manager' }));
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(api.updateDirectoryRecord).toHaveBeenCalledWith('people', JANE.id, {
      firstName: 'Jane',
      lastName: 'Doe',
      isPortalUser: true,
      roleIds: [CLERK.id, MANAGER.id],
      revision: 2,
    });
  });

  it('explains a refused turn-off of an administrator', async () => {
    api.updateDirectoryRecord.mockRejectedValue(
      new ApiError('ADMIN_ASSIGNED', 409)
    );
    render(
      <ThemeModeProvider>
        <RecordFormDialog
          collection="people"
          record={JANE}
          canWriteTaxIds={false}
          canManagePortal
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
      </ThemeModeProvider>
    );
    const form = await screen.findByRole('dialog', { name: 'Edit employee' });
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
    expect(
      within(dialog).getByText('Applies when this person first signs in.')
    ).toBeTruthy();
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
      await within(dialog).findByText(/earlier temporary password/)
    ).toBeTruthy();
  });
});

describe('Labels in the record detail (M0005-R014, R015)', () => {
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
    api.listDirectoryRecords.mockResolvedValue([vendor]);
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
          value: '512-555-0100',
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
    renderWithHeader(<DirectoryRecordsPage kind="vendor" />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Flag Supply LLC' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText('Email · Billing · primary')
    ).toBeTruthy();
    expect(within(dialog).getByText('Phone')).toBeTruthy();
    expect(
      within(dialog).getByText('Austin TX 78701 US · Location · primary')
    ).toBeTruthy();
    expect(
      within(dialog).getByText('rita@flag.test (Office) · Primary contact')
    ).toBeTruthy();
  });
});

describe('Clients (M0005-R007)', () => {
  it('creates a home buyer client with its primary buyer', async () => {
    api.listDirectoryRecords.mockResolvedValue([]);
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
    await user.type(within(form).getByLabelText(/Buyer SSN/), '222-33-4444');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(api.createDirectoryRecord).toHaveBeenCalledWith('organizations', {
      kind: 'client',
      legalName: 'Lot 12',
      dbaName: null,
      contacts: [
        {
          firstName: 'Ann',
          lastName: 'Smith',
          taxId: '222-33-4444',
          isPrimaryTaxContact: true,
        },
      ],
    });
  });

  it('shows a load failure from the server', async () => {
    api.listDirectoryRecords.mockRejectedValue(
      new ApiError('CELL_UNAVAILABLE', 503)
    );
    renderWithHeader(<DirectoryRecordsPage kind="client" />);
    expect(await screen.findByText(/database is unavailable/)).toBeTruthy();
  });
});

describe('Organization contacts (M0005-R004)', () => {
  it('adds a vendor contact by first and last name as primary and billing contact', async () => {
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
          record={null}
          defaults={{ organizationId: 'org-1', organizationKind: 'vendor' }}
          canWriteTaxIds
          onClose={vi.fn()}
          onSaved={onSaved}
        />
      </ThemeModeProvider>
    );
    const form = await screen.findByRole('dialog', { name: 'Add contact' });
    const user = userEvent.setup();
    await user.type(within(form).getByLabelText(/First name/), 'Rita');
    await user.type(within(form).getByLabelText(/Last name/), 'Moss');
    expect(within(form).queryByLabelText(/SSN/)).toBeNull();
    await user.click(within(form).getByLabelText('Primary contact'));
    await user.click(within(form).getByLabelText('Billing contact'));
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(api.createDirectoryRecord).toHaveBeenCalledWith(
      'organization-contacts',
      {
        organizationId: 'org-1',
        firstName: 'Rita',
        lastName: 'Moss',
        isPrimaryContact: true,
        isBillingContact: true,
      }
    );
    expect(onSaved).toHaveBeenCalledWith({ id: 'saved' });
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
    api.listDirectoryRecords.mockResolvedValue([ACME_BUILDERS]);
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
    const table = await screen.findByRole('table', { name: 'Clients' });
    await user.click(
      within(table).getByRole('button', { name: 'Acme Builders' })
    );
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        'rita@acme.test · 555-0100 · Primary contact · Billing contact'
      )
    ).toBeTruthy();
    expect(await within(dialog).findByText('Tenant: none')).toBeTruthy();
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

  it('shows the existing tenant instead of the Provision action', async () => {
    api.listClientTenants.mockResolvedValue([
      { code: 'ACME', provisioned: true, job: null },
    ]);
    renderWithHeader(<DirectoryRecordsPage kind="client" />);
    const user = userEvent.setup();
    const table = await screen.findByRole('table', { name: 'Clients' });
    await user.click(
      within(table).getByRole('button', { name: 'Acme Builders' })
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
    const table = await screen.findByRole('table', { name: 'Clients' });
    await user.click(
      within(table).getByRole('button', { name: 'Acme Builders' })
    );
    await screen.findByRole('dialog');
    expect(screen.queryByText(/^Tenant:/)).toBeNull();
    expect(api.listClientTenants).not.toHaveBeenCalled();
  });
});

describe('Labels (M0005-R017)', () => {
  it('adds a label and reports a duplicate name', async () => {
    api.listContactLabels.mockResolvedValue([
      {
        id: '44444444-4444-4444-8444-444444444444',
        appliesTo: 'email',
        name: 'work',
        archived: false,
        revision: 1,
      },
    ]);
    api.createContactLabel.mockRejectedValue(new ApiError('CONFLICT', 409));
    renderWithHeader(<LabelsPage />);
    await screen.findByRole('table', { name: 'Labels' });
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/New label/), 'work');
    await user.click(screen.getByRole('button', { name: 'Add label' }));
    expect(api.createContactLabel).toHaveBeenCalledWith({
      appliesTo: 'email',
      name: 'work',
    });
    expect(await screen.findByText(/already used/)).toBeTruthy();
  });
});
