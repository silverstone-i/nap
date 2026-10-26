/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { useSession } from '../src/auth/SessionContext.jsx';
import { LoginPage } from '../src/pages/LoginPage.jsx';
import { ThemeModeProvider } from '../src/theme/ThemeModeContext.jsx';
import { installMatchMedia } from './testUtils.jsx';

vi.mock('../src/auth/SessionContext.jsx', () => ({ useSession: vi.fn() }));

function renderWithNotice(notice) {
  installMatchMedia();
  useSession.mockReturnValue({ status: 'anonymous', notice, login: vi.fn() });
  return render(
    <ThemeModeProvider>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </ThemeModeProvider>
  );
}

afterEach(cleanup);

describe('session-ended notice (I0001-R046)', () => {
  it.each(['sessionExpired', 'sessionEnded'])(
    'shows one notice after %s',
    async notice => {
      renderWithNotice(notice);
      expect(
        await screen.findByText('Session ended. Sign in again.')
      ).toBeTruthy();
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    }
  );

  it('shows no notice on a fresh sign-in', () => {
    renderWithNotice(null);
    expect(screen.queryByText('Session ended. Sign in again.')).toBeNull();
  });
});
