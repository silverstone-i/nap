/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { storageChangeSchema, storageViewSchema } from '@nap/shared';

const change = {
  endpoint: 'https://example.r2.cloudflarestorage.com',
  region: 'auto',
  bucket: 'acme-files',
  accessKeyId: 'AKIAEXAMPLE',
  revision: null,
};

describe('storage connection schema (M0006-02-R001, R005)', () => {
  it('accepts an https endpoint with or without a secret', () => {
    expect(storageChangeSchema.safeParse(change).success).toBe(true);
    expect(
      storageChangeSchema.safeParse({ ...change, secretAccessKey: 's3cret' })
        .success
    ).toBe(true);
  });

  it('refuses http, credentials in the URL, unknown fields, and blanks', () => {
    for (const bad of [
      { ...change, endpoint: 'http://example.com' },
      { ...change, endpoint: 'https://user:pass@example.com' },
      { ...change, endpoint: 'not a url' },
      { ...change, bucket: '' },
      { ...change, extra: 1 },
      { ...change, secretAccessKey: '' },
    ])
      expect(storageChangeSchema.safeParse(bad).success).toBe(false);
  });

  it('never carries a secret in the view (R003)', () => {
    const view = {
      endpoint: change.endpoint,
      region: 'auto',
      bucket: 'acme-files',
      accessKeyId: 'AKIAEXAMPLE',
      secretSet: true,
      revision: 1,
    };
    expect(storageViewSchema.safeParse(view).success).toBe(true);
    expect(
      storageViewSchema.safeParse({ ...view, secretAccessKey: 'x' }).success
    ).toBe(false);
    expect(storageViewSchema.safeParse(null).success).toBe(true);
  });
});
