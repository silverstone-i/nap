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
import { addAuditFields } from '../../middlewares/audit/addAuditFields.js';

/**
 * Creates an Express router with standard CRUD routes
 * @param {object} controller - An object with create, getAll, getById, update, remove methods
 * @param {function} [extendRoutes] - Optional function that receives the router for adding custom routes
 * @returns {Router} - Configured Express router
 */

export default function createRouter(controller, extendRoutes, options = {}) {
  const router = express.Router();

  const {
    postMiddlewares = [], // e.g. [authenticateJwt, requireNapsoftUser]
    getMiddlewares = [],
    putMiddlewares = [],
    deleteMiddlewares = [],
    patchMiddlewares = [],
    disablePost = false,
    disableGetWhere = false,
    disablePut = false,
    disableDelete = false,
    disablePatch = false,
    disableBulkInsert = false,
    disableBulkUpdate = false,
    disableImportXls = false,
    disableExportXls = false,
  } = options;

  const safePostMiddlewares = postMiddlewares.includes(addAuditFields)
    ? postMiddlewares
    : [addAuditFields, ...postMiddlewares];

  const safePutMiddlewares = putMiddlewares.includes(addAuditFields)
    ? putMiddlewares
    : [addAuditFields, ...putMiddlewares];

  const safeDeleteMiddlewares = deleteMiddlewares.includes(addAuditFields)
    ? deleteMiddlewares
    : [addAuditFields, ...deleteMiddlewares];

    const safePatchMiddlewares = patchMiddlewares.includes(addAuditFields)
    ? patchMiddlewares
    : [addAuditFields, ...patchMiddlewares];

  // POST and GET for collection
  if (!disablePost) {
    router.post('/', ...safePostMiddlewares, (req, res) => controller.create(req, res));
  }

  // Use controller.get for collection GET; disables getWhere path
  if (!disableGetWhere) {
    router.get('/', ...getMiddlewares, (req, res) => controller.get(req, res));
    // router.getWhere('/where', ...getWhereMiddlewares, (req, res) => controller.get(req, res)); // replaced by above
  }

  // Health check or diagnostic
  router.get('/ping', (req, res) => {
    res.status(200).json({ message: 'pong' });
  });

  // Bulk and spreadsheet operations
  if (!disableBulkInsert) {
    router.post('/bulk-insert', ...safePostMiddlewares, (req, res) => controller.bulkInsert(req, res));
  }

  if (!disableBulkUpdate) {
    router.put('/bulk-update', ...safePutMiddlewares, (req, res) => controller.bulkUpdate(req, res));
  }

  if (!disableImportXls) {
    router.post('/import-xls', ...safePostMiddlewares, (req, res) => controller.importXls(req, res));
  }

  if (!disableExportXls) {
    router.post('/export-xls', (req, res) => controller.exportXls(req, res));
  }

  // Detail routes with optional middleware
  if (!disableGet) {
    router.get('/:id', ...getMiddlewares, (req, res) => controller.getById(req, res));
  }

  if (!disablePut) {
    router.put('/update', ...safePutMiddlewares, (req, res) => controller.update(req, res));
  }

  if (!disableDelete) {
    router.delete('/remove', ...safeDeleteMiddlewares, (req, res) => controller.remove(req, res));
  }

  if (!disablePatch) {
    router.patch('/restore', ...safePatchMiddlewares, (req, res) => controller.restore(req, res));
  }

  if (typeof extendRoutes === 'function') {
    extendRoutes(router);
  }

  return router;
}
