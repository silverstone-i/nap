/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it } from 'vitest';
import * as shared from '@nap/shared';

it('resolves the public ESM package without premature contracts', () => {
  expect(Object.keys(shared)).toEqual([]);
});
