/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import App from '../src/App';

describe('App', () => {
  it('renders the application name', () => {
    expect(renderToStaticMarkup(<App />)).toContain('NAP');
  });
});
