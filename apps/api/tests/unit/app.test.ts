/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import request from 'supertest';
import { expect, it } from 'vitest';
import { createApp } from '../../src/app.js';

it.each(['get', 'post'] as const)(
  'returns an empty 404 for %s without exposing framework details',
  async method => {
    const response = await request(createApp())[method]('/missing');
    expect(response.status).toBe(404);
    expect(response.text).toBe('');
    expect(response.headers).not.toHaveProperty('x-powered-by');
  }
);
