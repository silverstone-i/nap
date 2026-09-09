/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { xlsxMediaType } from '@nap/shared';
import { assignedDestination } from '../services/cellRouting.js';
import { HttpError } from '../util/httpError.js';
import { xlsxBody } from './xlsxBody.js';
import type { Request, Response, RequestHandler } from 'express';
import type { AdminHandle } from '../db/admin/repositories.js';
import type { RoutingConfiguration } from '../util/routingConfig.js';

/**
 * Does: Sends one bounded request to a configured private API and streams its reply.
 * Called by: routeToCell after destination authorization and body validation.
 * Why: TEN-008 forbids automatic replay, redirects and client-controlled upstream headers.
 */
async function forward(
  request: Request,
  response: Response,
  origin: string,
  timeoutMs: number
) {
  // Build the target path separately so //host or absolute URLs cannot replace the configured origin.
  const target = new URL(origin);
  const body: unknown = request.body;
  const bytes = Buffer.isBuffer(body)
    ? body
    : body === undefined
      ? undefined
      : Buffer.from(JSON.stringify(body));
  await new Promise<void>((resolve, reject) => {
    const upstream = (
      target.protocol === 'https:' ? httpsRequest : httpRequest
    )({
      protocol: target.protocol,
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: target.port,
      method: request.method,
      path: request.originalUrl,
      headers: {
        ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
        ...(bytes
          ? {
              'content-type': Buffer.isBuffer(body)
                ? xlsxMediaType
                : 'application/json',
              'content-length': bytes.length,
            }
          : {}),
        'x-forwarded-for': request.ip ?? request.socket.remoteAddress ?? '',
        'x-request-id': String(response.getHeader('x-request-id') ?? ''),
        accept: 'application/json',
      },
    });
    const timer = setTimeout(
      () => upstream.destroy(new Error('Upstream deadline')),
      timeoutMs
    );
    /** Does: Cancels outstanding work when the downstream connection closes. */
    function disconnected() {
      upstream.destroy(new Error('Downstream closed'));
    }
    response.once('close', disconnected);
    /** Does: Releases listeners and settles one forwarding attempt. */
    function finish(error?: Error) {
      clearTimeout(timer);
      response.removeListener('close', disconnected);
      if (error) {
        if (response.headersSent) response.destroy();
        reject(new HttpError('SERVICE_UNAVAILABLE'));
      } else resolve();
    }
    upstream.once('error', finish);
    upstream.once('response', incoming => {
      if (
        !incoming.statusCode ||
        (incoming.statusCode >= 300 && incoming.statusCode < 400)
      ) {
        incoming.destroy();
        finish(new Error('Invalid upstream response'));
        return;
      }
      response.status(incoming.statusCode);
      // Response headers are allowlisted too: Location and infrastructure details never escape.
      for (const name of [
        'content-type',
        'content-disposition',
        'set-cookie',
        'retry-after',
      ]) {
        const value = incoming.headers[name];
        if (value) response.setHeader(name, value);
      }
      response.setHeader('Cache-Control', 'no-store');
      incoming.once('error', finish);
      incoming.once('end', () => finish());
      incoming.pipe(response);
    });
    upstream.end(bytes);
  });
}

/**
 * Does: Forwards tenant requests and cell-writing commands while leaving central routes local.
 * Called by: the admin-only app after session resolution and JSON parsing.
 */
export function routeToCell(
  db: AdminHandle,
  config: RoutingConfiguration
): RequestHandler {
  return async (request, response, next) => {
    const path = request.path.toLowerCase().replace(/\/$/, '');
    if (!path.startsWith('/api/')) return next();
    let command: { body: unknown; action: string } | undefined;
    if (
      path === '/api/admin-tenancy/v1/control/entitlement' &&
      request.method === 'POST'
    ) {
      command = { body: request.body, action: 'entitlement' };
    } else if (path.startsWith('/api/admin-tenancy/')) {
      const body: unknown = request.body;
      if (
        request.method !== 'POST' ||
        ![
          '/api/admin-tenancy/v1/control/provision',
          '/api/admin-tenancy/v1/control/members',
        ].includes(path) ||
        !body ||
        typeof body !== 'object' ||
        !('operation' in body) ||
        !['member', 'retry', 'activate', 'reconcile', 'revoke'].includes(
          String(body.operation)
        )
      )
        return next();
      command = {
        body,
        action: path.endsWith('/members') ? 'members' : 'provision',
      };
    }
    const code = await assignedDestination(
      db,
      response.locals.session,
      command
    );
    const origin = config.origins.get(code);
    if (!origin) throw new HttpError('SERVICE_UNAVAILABLE');
    if (request.is(xlsxMediaType)) {
      await new Promise<void>((resolve, reject) =>
        xlsxBody(request, response, error =>
          error
            ? reject(
                error instanceof Error ? error : new HttpError('INVALID_INPUT')
              )
            : resolve()
        )
      );
    }
    await forward(request, response, origin, config.timeoutMs);
  };
}
