/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import { App } from '../src/App.jsx';

afterEach(cleanup);

it('renders the project placeholder', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'NAP' })).toBeTruthy();
  expect(screen.getByText('Project foundation is ready.')).toBeTruthy();
});
