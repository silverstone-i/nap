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
import { StorageSettingsPage } from '../../src/pages/settings/StorageSettingsPage.jsx';
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
  getStorage: vi.fn(),
  saveStorage: vi.fn(),
  deleteStorage: vi.fn(),
  getEffectiveSettings: vi.fn(),
}));

vi.mock('../../src/auth/SessionContext.jsx', () => ({
  useSession: vi.fn(),
}));

const TENANT = { id: 't1', code: 'ACME', name: 'Acme', tier: 'standard' };

const VIEW = {
  endpoint: 'https://acme.r2.cloudflarestorage.com',
  region: 'auto',
  bucket: 'acme-files',
  accessKeyId: 'AKIDEXAMPLE',
  secretSet: true,
  revision: 2,
};

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
            <StorageSettingsPage />
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
  api.getStorage.mockResolvedValue(VIEW);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Storage settings (M0006-02-R015)', () => {
  it('AC01: connects a new bucket with its secret and a null revision', async () => {
    api.getStorage.mockResolvedValue(null);
    api.saveStorage.mockResolvedValue({ ...VIEW, revision: 1 });
    renderPage();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Endpoint/), VIEW.endpoint);
    await user.type(screen.getByLabelText(/Region/), 'auto');
    await user.type(screen.getByLabelText(/Bucket/), 'acme-files');
    await user.type(screen.getByLabelText(/Access key ID/), 'AKIDEXAMPLE');
    await user.type(screen.getByLabelText(/Secret access key/), 'shh');
    await user.click(screen.getByRole('button', { name: 'Test and connect' }));
    expect(api.saveStorage).toHaveBeenCalledWith({
      endpoint: VIEW.endpoint,
      region: 'auto',
      bucket: 'acme-files',
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'shh',
      revision: null,
    });
    expect(await screen.findByText('Storage connected.')).toBeTruthy();
  });

  it('AC02, AC04: shows the connection without the secret and keeps it on a region change', async () => {
    api.saveStorage.mockResolvedValue({ ...VIEW, region: 'eu', revision: 3 });
    renderPage();
    const user = userEvent.setup();
    const secret = await screen.findByLabelText(/Secret access key/);
    expect(secret.value).toBe('');
    expect(
      screen.getByText('Leave blank to keep the saved secret.')
    ).toBeTruthy();
    const region = screen.getByLabelText(/Region/);
    await user.clear(region);
    await user.type(region, 'eu');
    await user.click(screen.getByRole('button', { name: 'Test and save' }));
    expect(api.saveStorage).toHaveBeenCalledWith({
      endpoint: VIEW.endpoint,
      region: 'eu',
      bucket: 'acme-files',
      accessKeyId: 'AKIDEXAMPLE',
      revision: 2,
    });
  });

  it('AC04: asks for the secret again when the access key ID changes', async () => {
    renderPage();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Access key ID/), '2');
    expect(
      screen.getByText(
        'Enter the secret again: the endpoint or access key ID changed.'
      )
    ).toBeTruthy();
    expect(screen.getByLabelText(/Secret access key/).required).toBe(true);
  });

  it('AC03: names the reason a connection test failed', async () => {
    api.saveStorage.mockRejectedValue(
      new ApiError('STORAGE_TEST_FAILED', 422, null, {
        reason: 'BUCKET_NOT_FOUND',
      })
    );
    renderPage();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Test and save' })
    );
    expect(
      await screen.findByText(
        /The connection test failed\. The bucket was not found/
      )
    ).toBeTruthy();
  });

  it('R006: disconnects after confirming, with the revision', async () => {
    api.deleteStorage.mockResolvedValue();
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      within(dialog).getByRole('button', { name: 'Disconnect' })
    );
    expect(api.deleteStorage).toHaveBeenCalledWith(2);
    expect(await screen.findByText('Storage disconnected.')).toBeTruthy();
    expect(
      await screen.findByRole('button', { name: 'Test and connect' })
    ).toBeTruthy();
  });

  it('AC09: is read-only without storage::write', async () => {
    useSession.mockReturnValue(
      sessionFor(['ACME::tenant-settings::storage::read'])
    );
    renderPage();
    expect(
      await screen.findByText(
        'You can view the storage connection but not change it.'
      )
    ).toBeTruthy();
    expect(screen.getByLabelText(/Bucket/).disabled).toBe(true);
    expect(screen.getByLabelText(/Secret access key/).value).toBe('Saved');
    expect(screen.queryByRole('button', { name: /Test and/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
  });
});
