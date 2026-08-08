/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomBytes } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { requireAuth } from '../../src/middleware/requireAuth.js';
import { ACCESS_COOKIE } from '../../src/util/cookies.js';
import { signAccessToken } from '../../src/util/tokens.js';

const SECRET = randomBytes(32);
const USER_ID = 'a3bb189e-8bf9-3888-9912-ace4e6543002';

// No database anywhere in this file: requireAuth is purely computational.
function buildApp(): express.Express {
  const app = express();
  app.use(cookieParser());
  app.get('/protected', requireAuth(SECRET), (req, res) => {
    res.json({ userId: req.auth?.userId });
  });
  return app;
}

describe('requireAuth', () => {
  it('refuses a request with no access cookie', async () => {
    const res = await request(buildApp()).get('/protected');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('refuses an invalid or foreign-key token', async () => {
    const foreign = await signAccessToken(USER_ID, randomBytes(32));
    const res = await request(buildApp())
      .get('/protected')
      .set('Cookie', `${ACCESS_COOKIE}=${foreign}`);

    expect(res.status).toBe(401);
  });

  it('attaches req.auth for a valid token', async () => {
    const token = await signAccessToken(USER_ID, SECRET);
    const res = await request(buildApp())
      .get('/protected')
      .set('Cookie', `${ACCESS_COOKIE}=${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: USER_ID });
  });
});
