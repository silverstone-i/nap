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
import { TenantContactsPage } from '../../src/pages/directory/TenantContactsPage.jsx';
import { LabelsPage } from '../../src/pages/directory/LabelsPage.jsx';
import { ContextualActionHeader } from '../../src/shell/ContextualActionHeader.jsx';
import { PageHeaderProvider } from '../../src/shell/PageHeaderContext.jsx';
import { ThemeModeProvider } from '../../src/theme/ThemeModeContext.jsx';
import { capabilitiesFixture, installMatchMedia } from '../testUtils.jsx';

vi.mock('../../src/api/endpoints.js', () => ({
  listDirectoryRecords: vi.fn(),
  getDirectoryRecord: vi.fn(),
  createDirectoryRecord: vi.fn(),
  updateDirectoryRecord: vi.fn(),
  archiveDirectoryRecord: vi.fn(),
  restoreDirectoryRecord: vi.fn(),
  revealTaxId: vi.fn(),
  addContactMethod: vi.fn(),
  updateContactMethod: vi.fn(),
  removeContactMethod: vi.fn(),
  addAddress: vi.fn(),
  updateAddress: vi.fn(),
  removeAddress: vi.fn(),
  listContactLabels: vi.fn(),
  createContactLabel: vi.fn(),
  renameContactLabel: vi.fn(),
  archiveContactLabel: vi.fn(),
  restoreContactLabel: vi.fn(),
  listTenantContacts: vi.fn(),
  addTenantContact: vi.fn(),
  removeTenantContact: vi.fn(),
  listCountries: vi.fn(async () => [
    { code: 'US', alpha3: 'USA', numericCode: '840', name: 'United States' },
  ]),
}));

vi.mock('../../src/auth/SessionContext.jsx', () => ({
  useSession: vi.fn(),
}));

const TENANT = { id: 't1', code: 'ACME', name: 'Acme', tier: 'standard' };
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
  archived: false,
  revision: 2,
  primaryEmail: 'jane@acme.test',
  primaryPhone: null,
};

function renderWithHeader(element) {
  return render(
    <ThemeModeProvider>
      <PageHeaderProvider>
        <ContextualActionHeader />
        {element}
      </PageHeaderProvider>
    </ThemeModeProvider>
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
    designations: ['primary'],
  });
  api.listContactLabels.mockResolvedValue([]);
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

    const user = userEvent.setup();
    await user.click(within(table).getByRole('button', { name: 'Jane Doe' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Primary contact')).toBeTruthy();
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
    await user.type(within(form).getByLabelText(/Buyer name/), 'Ann Smith');
    await user.type(within(form).getByLabelText(/Buyer SSN/), '222-33-4444');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    expect(api.createDirectoryRecord).toHaveBeenCalledWith('organizations', {
      kind: 'client',
      legalName: 'Lot 12',
      dbaName: null,
      contacts: [
        {
          fullName: 'Ann Smith',
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

describe('Tenant contacts (M0005-R018, R019)', () => {
  it('adds an employee as billing contact and reports the last-primary refusal', async () => {
    api.listTenantContacts.mockResolvedValue([
      {
        partyId: JANE.id,
        designation: 'primary',
        firstName: 'Jane',
        lastName: 'Doe',
        primaryEmail: 'jane@acme.test',
      },
    ]);
    api.removeTenantContact.mockRejectedValue(
      new ApiError('LAST_PRIMARY_CONTACT', 409)
    );
    api.addTenantContact.mockResolvedValue(undefined);
    renderWithHeader(<TenantContactsPage />);
    const table = await screen.findByRole('table', { name: 'Tenant contacts' });
    const user = userEvent.setup();
    await user.click(within(table).getByRole('button', { name: 'Remove' }));
    expect(
      await screen.findByText(/at least one primary contact/)
    ).toBeTruthy();

    await user.click(screen.getByRole('combobox', { name: 'Employee' }));
    await user.click(await screen.findByRole('option', { name: 'Jane Doe' }));
    await user.click(screen.getByRole('combobox', { name: 'Designation' }));
    await user.click(await screen.findByRole('option', { name: 'Billing' }));
    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    expect(api.addTenantContact).toHaveBeenCalledWith(JANE.id, 'billing');
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
