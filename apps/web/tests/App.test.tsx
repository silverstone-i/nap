/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { App } from '../src/App.js';

afterEach(cleanup);
it('renders an accessible application entry', () => {
  render(<App />);
  expect(screen.getByRole('main').contains(screen.getByRole('heading'))).toBe(
    true
  );
  expect(screen.getByRole('heading', { level: 1, name: 'NAP' })).toBeDefined();
});
