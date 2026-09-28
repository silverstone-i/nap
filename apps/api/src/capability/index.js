/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** @file Capability enforcement (I0005). See docs/PRDs/inter-module-workflows/I0005-rbac-decision-model.md. */
export { authorize, resolveCaller, resolveTenants } from './authorize.js';
export { decide, requiredCapability } from './decision.js';
export {
  checkRouteCapabilities,
  requireCapability,
  sessionOnly,
} from './requireCapability.js';
