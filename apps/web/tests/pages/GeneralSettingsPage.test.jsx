/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { ApiError } from '../../src/api/client.js';
import * as api from '../../src/api/endpoints.js';
import { useSession } from '../../src/auth/SessionContext.jsx';
import { GeneralSettingsPage } from '../../src/pages/settings/GeneralSettingsPage.jsx';
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
  getGeneralSettings: vi.fn(),
  updateGeneralSettings: vi.fn(),
  getEffectiveSettings: vi.fn(),
  listCountries: vi.fn(async () => [
    { code: 'US', alpha3: 'USA', numericCode: '840', name: 'United States' },
    { code: 'GB', alpha3: 'GBR', numericCode: '826', name: 'United Kingdom' },
  ]),
  listCurrencies: vi.fn(async () => [
    { code: 'USD', numericCode: '840', name: 'US Dollar', minorUnit: 2 },
  ]),
}));

vi.mock('../../src/auth/SessionContext.jsx', () => ({
  useSession: vi.fn(),
}));

const TENANT = { id: 't1', code: 'ACME', name: 'Acme', tier: 'standard' };

function sessionFor(patterns) {
  return {
    selectedTenant: TENANT,
    capabilities: capabilitiesFixture({ patterns, targetTenant: TENANT }),
    refreshCapabilities: vi.fn(),
  };
}

const at = (value, stored = false) => ({ value, stored });

function view(overrides = {}, revision = 1) {
  return {
    settings: {
      defaultCountry: at('US'),
      currency: at('USD'),
      timeZone: at('America/New_York'),
      dateFormat: at('MM/DD/YYYY'),
      language: at('en'),
      recordsPerPage: at(25),
      ...overrides,
    },
    revision,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeModeProvider>
        <NoticeProvider>
          <PageHeaderProvider>
            <ContextualActionHeader />
            <GeneralSettingsPage />
          </PageHeaderProvider>
        </NoticeProvider>
      </ThemeModeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  installMatchMedia();
  installResizeObserver();
  useSession.mockReturnValue(sessionFor(['ACME::*::*::*']));
  api.getGeneralSettings.mockResolvedValue(view());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('General settings (M0006-01-R010)', () => {
  it('AC06: shows every setting, marking defaults', async () => {
    renderPage();
    expect(await screen.findByLabelText('Records per page')).toBeTruthy();
    expect(screen.getAllByText('Default')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true);
  });

  it('AC02, AC06: saves only the changed setting with the revision', async () => {
    api.updateGeneralSettings.mockResolvedValue(
      view({ recordsPerPage: at(50, true) }, 2)
    );
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Records per page'));
    await user.click(screen.getByRole('option', { name: '50' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.updateGeneralSettings).toHaveBeenCalledWith({
      settings: { recordsPerPage: 50 },
      revision: 1,
    });
    expect(await screen.findByText('Settings saved.')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Reset Records per page to default' })
    ).toBeTruthy();
  });

  it('AC02: resets a stored setting to its default with null', async () => {
    api.getGeneralSettings.mockResolvedValue(
      view({ timeZone: at('America/Chicago', true) })
    );
    api.updateGeneralSettings.mockResolvedValue(view({}, 2));
    renderPage();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Reset Time zone to default' })
    );
    expect(screen.getByLabelText('Time zone').value).toBe('America/New_York');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.updateGeneralSettings).toHaveBeenCalledWith({
      settings: { timeZone: null },
      revision: 1,
    });
  });

  it('reloads after a stale save and keeps the new revision', async () => {
    api.updateGeneralSettings.mockRejectedValueOnce(
      new ApiError('STALE_REVISION', 409)
    );
    api.getGeneralSettings
      .mockResolvedValueOnce(view())
      .mockResolvedValueOnce(view({ language: at('en', true) }, 3));
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Records per page'));
    await user.click(screen.getByRole('option', { name: '100' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(/Someone else changed these settings/)
    ).toBeTruthy();
    await user.click(screen.getByLabelText('Records per page'));
    await user.click(screen.getByRole('option', { name: '100' }));
    api.updateGeneralSettings.mockResolvedValue(view({}, 4));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(api.updateGeneralSettings).toHaveBeenLastCalledWith({
      settings: { recordsPerPage: 100 },
      revision: 3,
    });
  });

  it('AC06: is read-only without general::write', async () => {
    useSession.mockReturnValue(
      sessionFor(['ACME::tenant-settings::general::read'])
    );
    renderPage();
    const field = await screen.findByLabelText('Records per page');
    expect(field.getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(
      screen.getByText('You can view these settings but not change them.')
    ).toBeTruthy();
    expect(
      within(document.body).queryByRole('button', { name: /Reset/ })
    ).toBeNull();
  });
});
