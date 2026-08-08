/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';

import {
  clampIdleWindow,
  IDLE_CHOICES,
} from '../../../../src/modules/auth/domain/sessionPolicy.js';

describe('clampIdleWindow', () => {
  it('passes a choice inside the bounds through', () => {
    expect(clampIdleWindow(60, 30, 120)).toBe(60);
  });

  it('clamps to the bound, not the choice (PRD 0004)', () => {
    expect(clampIdleWindow(120, 30, 60)).toBe(60);
    expect(clampIdleWindow(30, 60, 120)).toBe(60);
  });

  it('resolves inverted bounds to the most restrictive value', () => {
    // Two tenants can produce min > max (ADR-0014 decision 7); the tighter
    // maximum wins.
    expect(clampIdleWindow(90, 90, 60)).toBe(60);
  });

  it('offers the four PRD choices', () => {
    expect(IDLE_CHOICES).toEqual([30, 60, 90, 120]);
  });
});
