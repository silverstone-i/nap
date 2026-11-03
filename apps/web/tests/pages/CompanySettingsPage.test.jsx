/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import * as api from '../../src/api/endpoints.js';
import { useSession } from '../../src/auth/SessionContext.jsx';
import { CompanySettingsPage } from '../../src/pages/settings/CompanySettingsPage.jsx';
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
  getCompanyProfile: vi.fn(),
  submitCompanyTaxId: vi.fn(),
  listTaxIdFormats: vi.fn(),
}));

vi.mock('../../src/auth/SessionContext.jsx', () => ({
  useSession: vi.fn(),
}));

const TENANT = { id: 't1', code: 'OAK', name: 'Oak Homes', tier: 'starter' };
const EIN = {
  id: '6b6b6b6b-6b6b-4b6b-8b6b-6b6b6b6b6b6b',
  country: 'US',
  name: 'EIN',
  mask: '##-#######',
  archived: false,
};
const ANN = {
  id: '11111111-1111-4111-8111-111111111111',
  firstName: 'Ann',
  lastName: 'Admin',
  email: 'ann@oak.test',
  phone: '+15125550111',
  roles: ['primary', 'notifications'],
};
const BILLY = {
  id: '22222222-2222-4222-8222-222222222222',
  firstName: 'Billy',
  lastName: 'Bob',
  email: 'billy@oak.test',
  phone: null,
  roles: ['billing'],
};
const BETH = {
  ...BILLY,
  id: '33333333-3333-4333-8333-333333333333',
  firstName: 'Beth',
};

const profile = (overrides = {}) => ({
  legalName: 'Oak Homes LLC',
  dbaName: 'Oak Homes',
  taxId: {
    last4: '0001',
    formatId: EIN.id,
    status: 'pending',
    pendingLast4: '0002',
    reason: null,
  },
  primaryContacts: [ANN],
  billingContacts: [BETH, BILLY],
  notificationContacts: [ANN],
  ...overrides,
});

function sessionFor(patterns) {
  return {
    selectedTenant: TENANT,
    capabilities: capabilitiesFixture({ patterns, targetTenant: TENANT }),
    refreshCapabilities: vi.fn(),
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeModeProvider>
        <NoticeProvider>
          <PageHeaderProvider>
            <ContextualActionHeader />
            <CompanySettingsPage />
          </PageHeaderProvider>
        </NoticeProvider>
      </ThemeModeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  installMatchMedia();
  installResizeObserver();
  useSession.mockReturnValue(sessionFor(['OAK::*::*::*']));
  api.getCompanyProfile.mockResolvedValue(profile());
  api.listTaxIdFormats.mockResolvedValue([EIN]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CompanySettingsPage (I0013-R026)', () => {
  it('shows the names, the tax ID and its pending request, and the contacts', async () => {
    renderPage();
    expect(await screen.findByText('Oak Homes LLC')).toBeTruthy();
    expect(screen.getByText('DBA name: Oak Homes')).toBeTruthy();
    expect(screen.getByText('Tax ID ending 0001')).toBeTruthy();
    expect(
      screen.getByText('Tax ID ending 0002: pending approval')
    ).toBeTruthy();
    const primaries = screen.getByRole('list', { name: 'Primary contacts' });
    expect(within(primaries).getByText('Ann Admin')).toBeTruthy();
  });

  it('lists every holder of each role (I0014-R031)', async () => {
    renderPage();
    const billing = await screen.findByRole('list', {
      name: 'Billing contacts',
    });
    expect(
      within(billing)
        .getAllByRole('listitem')
        .map(item => item.textContent)
    ).toEqual(['Beth Bobbilly@oak.test', 'Billy Bobbilly@oak.test']);
    const notified = screen.getByRole('list', {
      name: 'Notification contacts',
    });
    expect(within(notified).getByText('Ann Admin')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Change billing contact' })
    ).toBeNull();
  });

  it('shows a rejection with its reason', async () => {
    api.getCompanyProfile.mockResolvedValue(
      profile({
        taxId: {
          last4: '0001',
          formatId: EIN.id,
          status: 'rejected',
          pendingLast4: '0002',
          reason: 'Name does not match.',
        },
      })
    );
    renderPage();
    expect(
      await screen.findByText(
        'Tax ID ending 0002: rejected. Name does not match.'
      )
    ).toBeTruthy();
  });

  it('submits a tax ID for approval', async () => {
    api.submitCompanyTaxId.mockResolvedValue(profile());
    renderPage();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Submit tax ID' })
    );
    const form = await screen.findByRole('dialog', { name: 'Submit tax ID' });
    await within(form).findByText('EIN');
    await user.type(within(form).getByLabelText(/^Tax ID/), '12-3450002');
    await user.click(within(form).getByRole('button', { name: 'Submit' }));
    expect(api.submitCompanyTaxId).toHaveBeenCalledWith({
      taxId: '12-3450002',
      taxIdFormatId: EIN.id,
    });
  });

  it('offers no changes without company-profile::write', async () => {
    useSession.mockReturnValue(
      sessionFor(['OAK::business-directory::directory::read'])
    );
    renderPage();
    await screen.findByText('Oak Homes LLC');
    expect(screen.queryByRole('button', { name: 'Submit tax ID' })).toBeNull();
  });
});
