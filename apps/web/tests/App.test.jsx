/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { App } from '../src/App.jsx';
import { ThemeModeProvider } from '../src/theme/ThemeModeContext.jsx';
import { ApiError } from '../src/api/client.js';
import * as api from '../src/api/endpoints.js';
import { installMatchMedia } from './testUtils.jsx';

vi.mock('../src/api/endpoints.js', () => ({
  login: vi.fn(),
  changePassword: vi.fn(),
  logout: vi.fn(),
  getAccessContext: vi.fn(),
  listTenants: vi.fn(),
  selectTenant: vi.fn(),
}));

beforeEach(() => {
  installMatchMedia();
  api.getAccessContext.mockRejectedValue(new ApiError('UNAUTHENTICATED', 401));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('sends an unauthenticated visitor to /login', async () => {
  render(
    <ThemeModeProvider>
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    </ThemeModeProvider>
  );
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
});
