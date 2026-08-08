/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  generateRefreshToken,
  hashRefreshVerifier,
  parseRefreshToken,
  PH_PLACEHOLDER,
  signAccessToken,
  verifierMatches,
  verifyAccessToken,
} from '../../src/util/tokens.js';

const SECRET = randomBytes(32);
const USER_ID = 'a3bb189e-8bf9-3888-9912-ace4e6543002';

afterEach(() => {
  vi.useRealTimers();
});

describe('access token', () => {
  it('signs and verifies, carrying sub and the ph placeholder', async () => {
    const token = await signAccessToken(USER_ID, SECRET);
    const verified = await verifyAccessToken(token, SECRET);

    expect(verified).toEqual({ userId: USER_ID });

    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()
    ) as Record<string, unknown>;
    expect(payload.sub).toBe(USER_ID);
    expect(payload.ph).toBe(PH_PLACEHOLDER);
  });

  it('rejects a token signed with another key', async () => {
    const token = await signAccessToken(USER_ID, SECRET);
    expect(await verifyAccessToken(token, randomBytes(32))).toBeNull();
  });

  it('rejects a tampered token and garbage input', async () => {
    const token = await signAccessToken(USER_ID, SECRET);
    expect(await verifyAccessToken(`${token}x`, SECRET)).toBeNull();
    expect(await verifyAccessToken('not-a-jwt', SECRET)).toBeNull();
  });

  it('expires after the 15-minute lifetime', async () => {
    vi.useFakeTimers();
    const token = await signAccessToken(USER_ID, SECRET);

    vi.advanceTimersByTime((ACCESS_TOKEN_TTL_SECONDS + 60) * 1000);
    expect(await verifyAccessToken(token, SECRET)).toBeNull();
  });
});

describe('refresh token', () => {
  it('embeds the session id and hashes only the verifier', () => {
    const { token, tokenHash } = generateRefreshToken(USER_ID);
    const parsed = parseRefreshToken(token);

    expect(parsed?.sessionId).toBe(USER_ID);
    expect(parsed).not.toBeNull();
    expect(hashRefreshVerifier(parsed?.verifier ?? '')).toBe(tokenHash);
    expect(token).not.toContain(tokenHash);
  });

  it('verifierMatches accepts the real verifier and nothing else', () => {
    const { token, tokenHash } = generateRefreshToken(USER_ID);
    const verifier = parseRefreshToken(token)?.verifier ?? '';

    expect(verifierMatches(verifier, tokenHash)).toBe(true);
    expect(verifierMatches('someone-elses-verifier', tokenHash)).toBe(false);
    expect(verifierMatches(verifier, 'feed')).toBe(false);
  });

  it('parseRefreshToken rejects malformed shapes', () => {
    expect(parseRefreshToken('')).toBeNull();
    expect(parseRefreshToken('no-dot')).toBeNull();
    expect(parseRefreshToken('.starts-with-dot')).toBeNull();
    expect(parseRefreshToken('ends-with-dot.')).toBeNull();
  });

  it('generates a distinct verifier every time', () => {
    expect(generateRefreshToken(USER_ID).tokenHash).not.toBe(
      generateRefreshToken(USER_ID).tokenHash
    );
  });
});
