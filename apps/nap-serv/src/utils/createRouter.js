'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import express from 'express';

/**
 * Creates an Express router with standard CRUD routes
 * @param {object} controller - An object with create, getAll, getById, update, remove methods
 * @param {function} [extendRoutes] - Optional function that receives the router for adding custom routes
 * @returns {Router} - Configured Express router
 */
export default function createRouter(controller, extendRoutes) {
  const router = express.Router();

  router
    .route('/')
    .post((req, res) => controller.create(req, res))
    .get((req, res) => controller.getAll(req, res));

  router
    .route('/:id')
    .get((req, res) => controller.getById(req, res))
    .put((req, res) => controller.update(req, res))
    .delete((req, res) => controller.remove(req, res));

  if (typeof extendRoutes === 'function') {
    extendRoutes(router);
  }

  return router;
}