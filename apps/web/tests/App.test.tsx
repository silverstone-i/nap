/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from '../src/App';

describe('App', () => {
  it('renders the branded landing page', () => {
    render(<App />);

    const wordmark = screen.getByRole('heading', { level: 1, name: 'NAP' });
    expect(wordmark.textContent).toContain('nap');

    expect(screen.getByText(/project-first accounting/i)).toBeDefined();
  });
});
