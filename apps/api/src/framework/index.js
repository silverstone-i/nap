/* Copyright (c) 2026–present NapSoft, LLC. SPDX-License-Identifier: AGPL-3.0-or-later */
/** @file Reusable HTTP mechanics: response envelopes, session cookies, and the route registry. Controllers are not yet implemented. See docs/architecture/module-design.md. */
export {
  ERROR_MESSAGE,
  ERROR_STATUS,
  errorEnvelope,
  sendData,
  sendError,
  sendNoContent,
  successEnvelope,
} from './envelope.js';
export {
  SESSION_COOKIE,
  clearSessionCookie,
  readCookie,
  setSessionCookie,
} from './cookies.js';
export { createRouteRegistry, routePath } from './routeRegistry.js';
