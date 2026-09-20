/* Copyright (c) 2026–present NapSoft, LLC. SPDX-License-Identifier: AGPL-3.0-or-later */
/** @file Request checks shared across routes: correlation, browser request protection, JSON body typing, and session resolution. See docs/architecture/module-design.md. */
export { REQUEST_ID_HEADER, correlation } from './correlation.js';
export {
  browserRequestProtection,
  trustedOrigin,
} from './browserRequestProtection.js';
export { jsonBodyOnly } from './jsonBody.js';
export { requireSession, sessionContext } from './sessionContext.js';
