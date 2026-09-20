/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Router } from 'express';

/** Database targets a router may name. Cell routers are dispatched per ready cell. */
const DATABASE_TARGETS = new Set(['admin', 'cell']);
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Build the mount path for one registration.
 * @param {{module: string, router: string, version: number}} registration
 * @returns {string} `/api/<module>/v<version>/<router>`
 */
export function routePath({ module, router, version }) {
  return `/api/${module}/v${version}/${router}`;
}

/**
 * Create the composition point for API routers.
 *
 * Each registration names its module, router, version, database target, and
 * the factory that builds the Express router, as
 * docs/architecture/bff.md#api-routing requires. Registration is separate
 * from mounting so the process can assemble the whole route table before any
 * database handle exists, and so tests can mount one router alone.
 * @returns {{register: (registration: object) => void, registrations: () => object[], mount: (app: import('express').Express, context: object) => void}}
 */
export function createRouteRegistry() {
  const entries = [];
  return {
    /**
     * Add one router to the table.
     * @param {object} registration
     * @param {string} registration.module Owning module name.
     * @param {string} registration.router Router name, the last path segment.
     * @param {number} registration.version Major API version.
     * @param {'admin'|'cell'} registration.database Database this router reads and writes.
     * @param {(context: object) => import('express').Router} registration.factory
     * @returns {void}
     * @throws {Error} When a field is missing, malformed, or already registered.
     */
    register(registration) {
      const { module, router, version, database, factory } = registration ?? {};
      if (!NAME_PATTERN.test(module ?? '') || !NAME_PATTERN.test(router ?? ''))
        throw new Error('Invalid route registration name');
      if (!Number.isInteger(version) || version < 1)
        throw new Error('Invalid route registration version');
      if (!DATABASE_TARGETS.has(database))
        throw new Error('Invalid route registration database');
      if (typeof factory !== 'function')
        throw new Error('Invalid route registration factory');
      const path = routePath(registration);
      if (entries.some(entry => routePath(entry) === path))
        throw new Error('Duplicate route registration');
      entries.push({ module, router, version, database, factory });
    },
    /**
     * The registered routers, in registration order.
     * @returns {object[]}
     */
    registrations() {
      return entries.slice();
    },
    /**
     * Build and mount every registered router.
     *
     * A cell router is mounted only when the context supplies the cell
     * registry, so an admin-only process cannot silently expose a route that
     * has no database behind it.
     * @param {import('express').Express} app
     * @param {object} context Handles and settings passed to each factory.
     * @returns {void}
     */
    mount(app, context) {
      for (const entry of entries) {
        if (entry.database === 'cell' && !context?.cells) continue;
        const built = entry.factory(context);
        if (!built) continue;
        const scoped = Router();
        scoped.use(built);
        app.use(routePath(entry), scoped);
      }
    },
  };
}
