/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { Request, RequestHandler, Response } from 'express';
import { getDb } from '../../../db/index.js';
import type { AppConfig } from '../../../util/appConfig.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  accessCookieOptions,
  clearAccessCookieOptions,
  clearRefreshCookieOptions,
  refreshCookieOptions,
} from '../../../util/cookies.js';
import { signAccessToken } from '../../../util/tokens.js';
import {
  listActiveBindings,
  resolveActiveTenant,
  switchTenant,
} from '../domain/activeTenant.js';
import { changePassword, verifyLogin } from '../domain/credentials.js';
import { resolveSessionPolicy } from '../domain/sessionPolicy.js';
import {
  createSession,
  findOwnedSession,
  refreshSession,
  revokeOtherSessions,
  revokeSession,
} from '../domain/sessions.js';
import type { SessionGrant } from '../domain/sessions.js';
import {
  changePasswordSchema,
  idleWindowSchema,
  loginSchema,
  switchTenantSchema,
} from './authSchemas.js';

/**
 * Every login refusal — unknown email, wrong password, no credential,
 * non-active user, no active binding — emits this one body, so no response
 * distinguishes accounts (PRD 0004).
 */
const INVALID_CREDENTIALS = { error: 'Invalid credentials' } as const;

/** Every refresh refusal is likewise indistinguishable to the caller. */
const INVALID_SESSION = { error: 'Invalid session' } as const;

export interface AuthController {
  login: RequestHandler;
  refresh: RequestHandler;
  logout: RequestHandler;
  switchTenant: RequestHandler;
  changePassword: RequestHandler;
  setIdleWindow: RequestHandler;
}

function readCookie(req: Request, name: string): string | undefined {
  const cookies = req.cookies as Record<string, string | undefined>;
  return cookies[name];
}

function badRequest(res: Response, issues: string[]): void {
  res.status(400).json({ error: 'Invalid request body', issues });
}

export function createAuthController(config: AppConfig): AuthController {
  async function setSessionCookies(
    res: Response,
    userId: string,
    grant: SessionGrant
  ): Promise<void> {
    const accessToken = await signAccessToken(userId, config.accessTokenSecret);
    res.cookie(ACCESS_COOKIE, accessToken, accessCookieOptions(config.cookies));
    res.cookie(
      REFRESH_COOKIE,
      grant.refreshToken,
      refreshCookieOptions(
        config.cookies,
        Math.max(0, grant.absoluteExpiresAt.getTime() - Date.now())
      )
    );
  }

  function clearSessionCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, clearAccessCookieOptions(config.cookies));
    res.clearCookie(REFRESH_COOKIE, clearRefreshCookieOptions(config.cookies));
  }

  return {
    login: async (req, res) => {
      const body = loginSchema.safeParse(req.body);
      if (!body.success) {
        badRequest(
          res,
          body.error.issues.map(issue => issue.message)
        );
        return;
      }
      const user = await verifyLogin(
        body.data.email,
        body.data.password,
        config.argon2
      );
      if (user === null) {
        res.status(401).json(INVALID_CREDENTIALS);
        return;
      }
      const bindings = await listActiveBindings(user.id);
      const policy = await resolveSessionPolicy(user.id);
      // Login is refused when no binding lands in an active tenant
      // (ADR-0004 decision 4), with the same body as a bad password.
      if (bindings.length === 0 || policy === null) {
        res.status(401).json(INVALID_CREDENTIALS);
        return;
      }
      const grant = await createSession(user.id, policy);
      await setSessionCookies(res, user.id, grant);
      res.json({
        bindings: bindings.map(binding => ({
          tenant_code: binding.tenant_code,
          company: binding.company,
        })),
        active_tenant_code: resolveActiveTenant(bindings),
        idle_expires_at: grant.idleExpiresAt.toISOString(),
        absolute_expires_at: grant.absoluteExpiresAt.toISOString(),
      });
    },

    refresh: async (req, res) => {
      const raw = readCookie(req, REFRESH_COOKIE);
      const result = raw === undefined ? null : await refreshSession(raw);
      if (result === null || !result.ok) {
        res.status(401).json(INVALID_SESSION);
        return;
      }
      await setSessionCookies(res, result.userId, result);
      res.json({
        idle_expires_at: result.idleExpiresAt.toISOString(),
        absolute_expires_at: result.absoluteExpiresAt.toISOString(),
      });
    },

    logout: async (req, res) => {
      // req.auth is set: the route sits behind requireAuth.
      const userId = req.auth?.userId ?? '';
      const session = await findOwnedSession(
        readCookie(req, REFRESH_COOKIE),
        userId
      );
      if (session !== null) {
        await revokeSession(session.id, userId);
      }
      // Idempotent: cookies clear even when the session is already gone.
      clearSessionCookies(res);
      res.status(204).end();
    },

    switchTenant: async (req, res) => {
      const body = switchTenantSchema.safeParse(req.body);
      if (!body.success) {
        badRequest(
          res,
          body.error.issues.map(issue => issue.message)
        );
        return;
      }
      const userId = req.auth?.userId ?? '';
      const switched = await switchTenant(userId, body.data.tenant_code);
      if (!switched) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      res.json({ active_tenant_code: body.data.tenant_code });
    },

    changePassword: async (req, res) => {
      const body = changePasswordSchema.safeParse(req.body);
      if (!body.success) {
        badRequest(
          res,
          body.error.issues.map(issue => issue.message)
        );
        return;
      }
      const userId = req.auth?.userId ?? '';
      const changed = await changePassword(
        userId,
        body.data.current_password,
        body.data.new_password,
        config.argon2
      );
      if (!changed) {
        res.status(401).json(INVALID_CREDENTIALS);
        return;
      }
      // "Revokes the caller's other sessions" (PRD 0004). Without a valid
      // refresh cookie there is no session to spare, so all are revoked.
      const session = await findOwnedSession(
        readCookie(req, REFRESH_COOKIE),
        userId
      );
      await revokeOtherSessions(userId, session?.id ?? null);
      res.status(204).end();
    },

    setIdleWindow: async (req, res) => {
      const body = idleWindowSchema.safeParse(req.body);
      if (!body.success) {
        badRequest(
          res,
          body.error.issues.map(issue => issue.message)
        );
        return;
      }
      const userId = req.auth?.userId ?? '';
      // Takes effect at the next refresh, clamped to the tenant bounds
      // (ADR-0014); nothing on the live session row changes here.
      await getDb().portalUsers.updateWhere([{ id: userId }], {
        session_idle_minutes: body.data.idle_minutes,
      });
      res.status(204).end();
    },
  };
}
