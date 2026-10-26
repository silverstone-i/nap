/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { ApiError } from '../src/api/client.js';
import * as api from '../src/api/endpoints.js';
import { useSession } from '../src/auth/SessionContext.jsx';
import { StandardDataGrid } from '../src/grid/StandardDataGrid.jsx';
import { ProfilePage } from '../src/pages/ProfilePage.jsx';
import { ContextualActionHeader } from '../src/shell/ContextualActionHeader.jsx';
import {
  EffectiveSettingsProvider,
  useEffectiveSettings,
} from '../src/shell/EffectiveSettingsContext.jsx';
import { NoticeProvider } from '../src/shell/NoticeContext.jsx';
import { PageHeaderProvider } from '../src/shell/PageHeaderContext.jsx';
import { ProfileMenu } from '../src/shell/ProfileMenu.jsx';
import { ThemeModeProvider } from '../src/theme/ThemeModeContext.jsx';
import {
  capabilitiesFixture,
  installMatchMedia,
  installResizeObserver,
} from './testUtils.jsx';

vi.mock('../src/api/endpoints.js', () => ({
  getEffectiveSettings: vi.fn(),
  getFileLink: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  uploadProfileImage: vi.fn(),
  deleteProfileImage: vi.fn(),
}));

vi.mock('../src/auth/SessionContext.jsx', () => ({
  useSession: vi.fn(),
}));

const TENANT = { id: 't1', code: 'ACME', name: 'Acme', tier: 'standard' };
const FILE = '22222222-2222-4222-8222-222222222222';
const TENANT_VALUES = {
  timeZone: 'America/New_York',
  dateFormat: 'MM/DD/YYYY',
  language: 'en',
  recordsPerPage: 25,
};

function effective(overrides = {}) {
  return {
    defaultCountry: 'US',
    currency: 'USD',
    ...TENANT_VALUES,
    logoFileId: null,
    storageConnected: false,
    profileImage: null,
    ...overrides,
  };
}

function profile(overrides = {}) {
  return {
    overrides: {},
    tenantValues: TENANT_VALUES,
    defaultImage: null,
    imageFileId: null,
    revision: 0,
    ...overrides,
  };
}

function renderWith(children) {
  return render(
    <MemoryRouter>
      <ThemeModeProvider>
        <NoticeProvider>
          <PageHeaderProvider>
            <EffectiveSettingsProvider tenantId={TENANT.id}>
              <ContextualActionHeader />
              {children}
            </EffectiveSettingsProvider>
          </PageHeaderProvider>
        </NoticeProvider>
      </ThemeModeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  installMatchMedia();
  installResizeObserver();
  useSession.mockReturnValue({
    user: { email: 'jane.doe@acme.test' },
    selectedTenant: TENANT,
    capabilities: capabilitiesFixture({ patterns: [], targetTenant: TENANT }),
    refreshCapabilities: vi.fn(),
  });
  api.getEffectiveSettings.mockResolvedValue(effective());
  api.getProfile.mockResolvedValue(profile());
  api.getFileLink.mockResolvedValue({
    url: 'https://bucket.example/me.png?X-Amz-Signature=1',
    expiresAt: new Date().toISOString(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('account button (M0006-03-R007)', () => {
  it('AC03: shows a default image, an uploaded image, or initials', async () => {
    api.getEffectiveSettings.mockResolvedValue(
      effective({ profileImage: { defaultImage: 'orbit' } })
    );
    const first = renderWith(<ProfileMenu />);
    await vi.waitFor(() =>
      expect(first.container.querySelector('img')?.getAttribute('src')).toBe(
        '/avatars/orbit.gif'
      )
    );
    cleanup();

    api.getEffectiveSettings.mockResolvedValue(
      effective({ profileImage: { fileId: FILE } })
    );
    const second = renderWith(<ProfileMenu />);
    await vi.waitFor(() =>
      expect(second.container.querySelector('img')?.getAttribute('src')).toBe(
        'https://bucket.example/me.png?X-Amz-Signature=1'
      )
    );
    expect(api.getFileLink).toHaveBeenCalledWith(FILE);
    cleanup();

    api.getEffectiveSettings.mockResolvedValue(effective());
    renderWith(<ProfileMenu />);
    expect(await screen.findByText('JA')).toBeTruthy();
  });

  it('AC04: an uploaded image whose link fails shows initials', async () => {
    api.getEffectiveSettings.mockResolvedValue(
      effective({ profileImage: { fileId: FILE } })
    );
    api.getFileLink.mockRejectedValue(new ApiError('STORAGE_UNAVAILABLE', 503));
    const { container } = renderWith(<ProfileMenu />);
    await vi.waitFor(() => expect(api.getFileLink).toHaveBeenCalled());
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('JA')).toBeTruthy();
  });

  it('offers Profile in the account menu', async () => {
    renderWith(<ProfileMenu />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    // I0001-R044: the display mode lives on Profile, not in a submenu.
    expect(
      screen.getAllByRole('menuitem').map(item => item.textContent)
    ).toEqual(['Profile', 'Change password', 'Log out']);
  });
});

describe('Profile screen (M0006-03-R006)', () => {
  it('AC05, AC09, AC10: shows the tenant value beside an override and saves each change at once (M0006-03-R010, R011)', async () => {
    api.getProfile.mockResolvedValue(
      profile({ overrides: { timeZone: 'Europe/London' }, revision: 3 })
    );
    api.updateProfile
      .mockResolvedValueOnce(profile({ revision: 4 }))
      .mockResolvedValue(
        profile({ overrides: { recordsPerPage: 100 }, revision: 5 })
      );
    renderWith(<ProfilePage />);
    const user = userEvent.setup();
    expect(
      await screen.findByText('Tenant setting: America/New_York')
    ).toBeTruthy();
    expect(screen.getByLabelText('Time zone').value).toBe('Europe/London');
    for (const text of [
      'Using the tenant setting',
      'Your settings',
      'Or choose one of these:',
    ])
      expect(screen.queryByText(text)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'Use tenant setting for Time zone' })
    );
    expect(api.updateProfile).toHaveBeenLastCalledWith({
      overrides: { timeZone: null },
      revision: 3,
    });
    expect(await screen.findByText('Profile saved.')).toBeTruthy();

    await user.click(screen.getByLabelText('Records per page'));
    await user.click(screen.getByRole('option', { name: '100' }));
    expect(api.updateProfile).toHaveBeenLastCalledWith({
      overrides: { recordsPerPage: 100 },
      revision: 4,
    });
  });

  it('AC27: sets the theme from Profile without saving the profile (I0001-R044)', async () => {
    renderWith(<ProfilePage />);
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Theme'));
    await user.click(screen.getByRole('option', { name: 'Dark' }));
    expect(screen.getByLabelText('Theme').textContent).toBe('Dark');
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('AC03, AC04: chooses a default image; upload shows only with storage', async () => {
    api.updateProfile.mockResolvedValue(
      profile({ defaultImage: 'wave', revision: 1 })
    );
    renderWith(<ProfilePage />);
    const user = userEvent.setup();
    const group = await screen.findByRole('radiogroup', {
      name: 'Default profile images',
    });
    expect(screen.queryByLabelText('Profile image file')).toBeNull();
    await user.click(
      within(group).getByRole('radio', { name: 'Default image wave' })
    );
    expect(api.updateProfile).toHaveBeenCalledWith({
      defaultImage: 'wave',
      revision: 0,
    });
    expect(
      await screen.findByRole('radio', { name: 'Default image wave' })
    ).toHaveProperty('ariaChecked', 'true');
    // AC08: a default image is removed with the same single control.
    expect(screen.getByRole('button', { name: 'Remove image' })).toBeTruthy();
  });

  it('AC03: uploads an image when storage is connected, then removes it', async () => {
    api.getEffectiveSettings.mockResolvedValue(
      effective({ storageConnected: true })
    );
    api.uploadProfileImage.mockResolvedValue(
      profile({ imageFileId: FILE, revision: 1 })
    );
    api.updateProfile.mockResolvedValue(profile({ revision: 2 }));
    renderWith(<ProfilePage />);
    const user = userEvent.setup();
    const input = await screen.findByLabelText('Profile image file');
    const file = new File([new Uint8Array([0x89, 0x50])], 'me.png', {
      type: 'image/png',
    });
    await user.upload(input, file);
    expect(api.uploadProfileImage).toHaveBeenCalledWith(file);
    // M0006-03-R009: one control, which also drops an uploaded image.
    expect(screen.queryByRole('button', { name: 'Use initials' })).toBeNull();
    await user.click(
      await screen.findByRole('button', { name: 'Remove image' })
    );
    expect(api.updateProfile).toHaveBeenCalledWith({
      defaultImage: null,
      revision: 1,
    });
    expect(await screen.findByText('Profile image removed.')).toBeTruthy();
  });
});

describe('grid page size (M0006-03-R008)', () => {
  const fetchPage = vi.fn(async () => ({ rows: [], rowCount: 0 }));
  let save;
  function Saver() {
    save = useEffectiveSettings().saveRecordsPerPage;
    return null;
  }

  it('AC06: a grid starts at the member page size and follows a saved choice', async () => {
    api.getEffectiveSettings
      .mockResolvedValueOnce(effective({ recordsPerPage: 50 }))
      .mockResolvedValue(effective({ recordsPerPage: 100 }));
    api.getProfile.mockResolvedValue(profile({ revision: 2 }));
    api.updateProfile.mockResolvedValue(profile({ revision: 3 }));
    renderWith(
      <>
        <Saver />
        <StandardDataGrid
          columns={[{ field: 'name', headerName: 'Name' }]}
          fetchPage={fetchPage}
        />
      </>
    );
    await vi.waitFor(() =>
      expect(fetchPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ pageSize: 50 })
      )
    );
    await act(() => save(100));
    expect(api.updateProfile).toHaveBeenCalledWith({
      overrides: { recordsPerPage: 100 },
      revision: 2,
    });
    await vi.waitFor(() =>
      expect(fetchPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ pageSize: 100 })
      )
    );
  });

  it('retries once when the profile changed meanwhile', async () => {
    api.getProfile
      .mockResolvedValueOnce(profile({ revision: 1 }))
      .mockResolvedValueOnce(profile({ revision: 2 }));
    api.updateProfile
      .mockRejectedValueOnce(new ApiError('STALE_REVISION', 409))
      .mockResolvedValue(profile({ revision: 3 }));
    renderWith(<Saver />);
    await vi.waitFor(() => expect(api.getEffectiveSettings).toHaveBeenCalled());
    await act(() => save(50));
    expect(api.updateProfile).toHaveBeenLastCalledWith({
      overrides: { recordsPerPage: 50 },
      revision: 2,
    });
  });

  it('does not save without a selected tenant', async () => {
    render(
      <EffectiveSettingsProvider tenantId={null}>
        <Saver />
      </EffectiveSettingsProvider>
    );
    await act(() => save(100));
    expect(api.getProfile).not.toHaveBeenCalled();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });
});
