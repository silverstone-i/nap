/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { initialsFromEmail } from '../src/shell/initials.js';

describe('initialsFromEmail', () => {
  it('takes the first two letters of the local part', () => {
    expect(initialsFromEmail('jordan@example.com')).toBe('JO');
  });
  it('ignores digits and punctuation in the local part', () => {
    expect(initialsFromEmail('j.9smith@example.com')).toBe('JS');
  });
  it('falls back to ? for an unusable input', () => {
    expect(initialsFromEmail('')).toBe('?');
    expect(initialsFromEmail('123@example.com')).toBe('?');
    expect(initialsFromEmail(undefined)).toBe('?');
  });
});
