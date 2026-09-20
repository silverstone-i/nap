/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';

/** Response header carrying the correlation identifier. */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * Assign every request a correlation UUID and echo it back.
 *
 * The identifier is generated here and never read from a request header: a
 * caller-supplied value would let an attacker collide with, or forge, the
 * `request_id` recorded on administrative events.
 * @returns {import('express').RequestHandler}
 */
export function correlation() {
  return (request, response, next) => {
    request.requestId = randomUUID();
    response.setHeader(REQUEST_ID_HEADER, request.requestId);
    next();
  };
}
