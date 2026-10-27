/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  USER_AGENT_MAX_LENGTH,
  describeUserAgent,
  truncateUserAgent,
} from '../../src/modules/admin-tenancy/domain/userAgent.js';

describe('describeUserAgent (M0001-14-R003, AC04)', () => {
  it.each([
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Chrome on macOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      'Edge on Windows',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
      'Opera on Windows',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
      'Firefox on Linux',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      'Safari on macOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari on iOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
      'Chrome on iOS',
    ],
    [
      'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
      'Firefox on iOS',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/130.0.2849.80 Mobile/15E148 Safari/605.1.15',
      'Edge on iOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.102 Mobile Safari/537.36',
      'Chrome on Android',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.102 Mobile Safari/537.36 EdgA/130.0.2849.80',
      'Edge on Android',
    ],
    [
      'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Chrome on ChromeOS',
    ],
  ])('labels %s', (header, label) => {
    expect(describeUserAgent(header)).toBe(label);
  });

  it('falls back to "Unknown browser" and drops an unknown OS', () => {
    expect(describeUserAgent('curl/8.7.1')).toBe('Unknown browser');
    expect(describeUserAgent('nap-probe (Windows NT 10.0)')).toBe(
      'Unknown browser on Windows'
    );
    expect(describeUserAgent('Mozilla/5.0 Firefox/131.0')).toBe('Firefox');
  });

  it('labels nothing when no user agent was stored', () => {
    expect(describeUserAgent(null)).toBeNull();
    expect(describeUserAgent(undefined)).toBeNull();
  });
});

describe('truncateUserAgent (M0001-14-R001, AC03)', () => {
  it('trims and caps the header at 512 characters', () => {
    expect(truncateUserAgent('  Firefox/131.0  ')).toBe('Firefox/131.0');
    expect(truncateUserAgent('a'.repeat(600))).toBe(
      'a'.repeat(USER_AGENT_MAX_LENGTH)
    );
  });

  it('stores null for a missing, blank, or non-string header', () => {
    expect(truncateUserAgent(undefined)).toBeNull();
    expect(truncateUserAgent('   ')).toBeNull();
    expect(truncateUserAgent(['Chrome/130'])).toBeNull();
  });
});
