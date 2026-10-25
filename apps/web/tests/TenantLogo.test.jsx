/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import * as api from '../src/api/endpoints.js';
import { useSession } from '../src/auth/SessionContext.jsx';
import { LogoSettings } from '../src/pages/settings/LogoSettings.jsx';
import { EffectiveSettingsProvider } from '../src/shell/EffectiveSettingsContext.jsx';
import { NoticeProvider } from '../src/shell/NoticeContext.jsx';
import { TopHeader } from '../src/shell/TopHeader.jsx';
import { ThemeModeProvider } from '../src/theme/ThemeModeContext.jsx';
import {
  capabilitiesFixture,
  installMatchMedia,
  installResizeObserver,
} from './testUtils.jsx';

vi.mock('../src/api/endpoints.js', () => ({
  getEffectiveSettings: vi.fn(),
  getFileLink: vi.fn(),
  uploadLogo: vi.fn(),
  deleteLogo: vi.fn(),
}));

vi.mock('../src/auth/SessionContext.jsx', () => ({
  useSession: vi.fn(),
}));

vi.mock('../src/shell/ProfileMenu.jsx', () => ({
  ProfileMenu: () => null,
}));

const TENANT = { id: 't1', code: 'ACME', name: 'Acme', tier: 'standard' };
const LOGO = '11111111-1111-4111-8111-111111111111';
const URL = 'https://bucket.example/logo?X-Amz-Signature=abc';

function effective(overrides = {}) {
  return {
    defaultCountry: 'US',
    currency: 'USD',
    timeZone: 'America/New_York',
    dateFormat: 'MM/DD/YYYY',
    language: 'en',
    recordsPerPage: 25,
    logoFileId: null,
    storageConnected: false,
    ...overrides,
  };
}

function renderWith(children) {
  return render(
    <MemoryRouter>
      <ThemeModeProvider>
        <NoticeProvider>
          <EffectiveSettingsProvider tenantId={TENANT.id}>
            {children}
          </EffectiveSettingsProvider>
        </NoticeProvider>
      </ThemeModeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  installMatchMedia();
  installResizeObserver();
  useSession.mockReturnValue({
    selectedTenant: TENANT,
    capabilities: capabilitiesFixture({
      patterns: ['ACME::*::*::*'],
      targetTenant: TENANT,
    }),
    refreshCapabilities: vi.fn(),
  });
  api.getFileLink.mockResolvedValue({
    url: URL,
    expiresAt: new Date().toISOString(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('tenant logo in the shell (M0006-02-R014)', () => {
  it('AC08: shows the logo beside the tenant name', async () => {
    api.getEffectiveSettings.mockResolvedValue(
      effective({ logoFileId: LOGO, storageConnected: true })
    );
    const { container } = renderWith(<TopHeader onMenuClick={() => {}} />);
    await vi.waitFor(() =>
      expect(container.querySelector('img')?.getAttribute('src')).toBe(URL)
    );
    expect(api.getFileLink).toHaveBeenCalledWith(LOGO);
    expect(screen.getByText('Acme')).toBeTruthy();
  });

  it('AC08: shows the name alone with no logo, no storage, a failed link, or a broken image', async () => {
    api.getEffectiveSettings.mockResolvedValue(effective());
    const first = renderWith(<TopHeader onMenuClick={() => {}} />);
    await screen.findByText('Acme');
    expect(first.container.querySelector('img')).toBeNull();
    expect(api.getFileLink).not.toHaveBeenCalled();
    cleanup();

    // R006: after disconnecting, the logo row stays but is not shown.
    api.getEffectiveSettings.mockResolvedValue(effective({ logoFileId: LOGO }));
    const disconnected = renderWith(<TopHeader onMenuClick={() => {}} />);
    await vi.waitFor(() => expect(api.getEffectiveSettings).toHaveBeenCalled());
    await screen.findByText('Acme');
    expect(disconnected.container.querySelector('img')).toBeNull();
    expect(api.getFileLink).not.toHaveBeenCalled();
    cleanup();

    api.getEffectiveSettings.mockResolvedValue(
      effective({ logoFileId: LOGO, storageConnected: true })
    );
    api.getFileLink.mockRejectedValueOnce(new Error('STORAGE_UNAVAILABLE'));
    const second = renderWith(<TopHeader onMenuClick={() => {}} />);
    await vi.waitFor(() => expect(api.getFileLink).toHaveBeenCalled());
    expect(second.container.querySelector('img')).toBeNull();
    cleanup();

    const third = renderWith(<TopHeader onMenuClick={() => {}} />);
    await vi.waitFor(() =>
      expect(third.container.querySelector('img')).not.toBeNull()
    );
    fireEvent.error(third.container.querySelector('img'));
    expect(third.container.querySelector('img')).toBeNull();
    expect(screen.getByText('Acme')).toBeTruthy();
  });
});

describe('logo control (M0006-02-R013)', () => {
  it('AC09: offers upload only when storage is connected', async () => {
    api.getEffectiveSettings.mockResolvedValue(effective());
    renderWith(<LogoSettings />);
    expect(
      await screen.findByText(
        'Connect file storage in Settings → Storage to upload a logo.'
      )
    ).toBeTruthy();
    expect(screen.queryByText('Upload logo')).toBeNull();
  });

  it('uploads an image and refuses an oversized one before sending it', async () => {
    api.getEffectiveSettings.mockResolvedValue(
      effective({ storageConnected: true })
    );
    api.uploadLogo.mockResolvedValue({ logoFileId: LOGO });
    renderWith(<LogoSettings />);
    const user = userEvent.setup();
    const input = await screen.findByLabelText('Logo file');
    const big = new File([new Uint8Array(3 * 1024 * 1024)], 'big.png', {
      type: 'image/png',
    });
    await user.upload(input, big);
    expect(
      screen.getByText(
        'The logo must be a PNG, JPEG, WebP, or GIF image of at most 2 MB.'
      )
    ).toBeTruthy();
    expect(api.uploadLogo).not.toHaveBeenCalled();
    const small = new File([new Uint8Array([0x89, 0x50])], 'logo.png', {
      type: 'image/png',
    });
    await user.upload(input, small);
    expect(api.uploadLogo).toHaveBeenCalledWith(small);
    expect(await screen.findByText('Logo saved.')).toBeTruthy();
  });

  it('removes the logo', async () => {
    api.getEffectiveSettings.mockResolvedValue(
      effective({ logoFileId: LOGO, storageConnected: true })
    );
    api.deleteLogo.mockResolvedValue();
    renderWith(<LogoSettings />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Remove logo' })
    );
    expect(api.deleteLogo).toHaveBeenCalled();
    expect(await screen.findByText('Logo removed.')).toBeTruthy();
  });
});
