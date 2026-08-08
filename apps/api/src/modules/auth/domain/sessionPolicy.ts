/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { getDb } from '../../../db/index.js';

/** The user-selectable idle windows (ADR-0014 decision 4). */
export const IDLE_CHOICES = [30, 60, 90, 120] as const;

export type IdleChoice = (typeof IDLE_CHOICES)[number];

/** The effective per-session policy (ADR-0014 decisions 4, 5, 7). */
export interface SessionPolicy {
  /** The user's chosen idle window clamped to the effective bounds. */
  idleMinutes: number;
  /** The unconditional session-age cap. */
  absoluteHours: number;
}

/**
 * The user's choice clamped into `[min, max]`. When tenant policies produce
 * an inverted intersection (`min > max`), the most restrictive value — the
 * smaller `max` — wins (ADR-0014 decision 7).
 */
export function clampIdleWindow(
  chosen: number,
  min: number,
  max: number
): number {
  if (min > max) {
    return max;
  }
  return Math.min(Math.max(chosen, min), max);
}

interface PolicyRow {
  min_idle: number;
  max_idle: number;
  absolute_hours: number;
  chosen: number;
}

/**
 * The most restrictive policy across the user's active bindings in active
 * tenants: tightest idle bounds, shortest absolute lifetime. Recomputed at
 * login and at every refresh — never stored on the session row — so an
 * admin's tightening lands at the next refresh (ADR-0014). Null when no
 * active binding lands in an active tenant, which refuses the request.
 */
export async function resolveSessionPolicy(
  userId: string
): Promise<SessionPolicy | null> {
  const db = getDb();
  const row = await db.oneOrNone<PolicyRow>(
    `SELECT MAX(t.session_idle_min_minutes) AS min_idle,
            MIN(t.session_idle_max_minutes) AS max_idle,
            MIN(t.session_absolute_hours) AS absolute_hours,
            u.session_idle_minutes AS chosen
       FROM admin.portal_user_tenants b
       JOIN admin.tenants t ON t.id = b.tenant_id
       JOIN admin.portal_users u ON u.id = b.portal_user_id
      WHERE b.portal_user_id = $1
        AND b.status = 'active' AND b.deactivated_at IS NULL
        AND t.status = 'active' AND t.deactivated_at IS NULL
      GROUP BY u.session_idle_minutes`,
    [userId]
  );
  if (row === null) {
    return null;
  }
  return {
    idleMinutes: clampIdleWindow(row.chosen, row.min_idle, row.max_idle),
    absoluteHours: row.absolute_hours,
  };
}
