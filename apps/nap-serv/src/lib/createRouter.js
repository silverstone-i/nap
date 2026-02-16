/**
 * @file createRouter — generic REST route factory for pg-schemata controllers
 * @module nap-serv/lib/createRouter
 *
 * Generates standard CRUD routes per PRD §4.1:
 *   POST /, GET /, GET /where, GET /archived, GET /ping, GET /:id,
 *   POST /bulk-insert, POST /import-xls, POST /export-xls,
 *   PUT /bulk-update, PUT /update, DELETE /archive, PATCH /restore
 *
 * Automatically applies addAuditFields middleware to mutation routes.
 * Accepts per-method middleware arrays and route disable flags.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import { addAuditFields } from '../middleware/addAuditFields.js';
import multer from 'multer';

/**
 * @param {object} controller BaseController (or subclass) instance
 * @param {Function} [extendRoutes] Callback receiving router for custom routes
 * @param {object} [options] Route configuration options
 * @returns {Router} Configured Express router
 */
export default function createRouter(controller, extendRoutes, options = {}) {
  const router = Router();

  const {
    postMiddlewares = [],
    getMiddlewares = [],
    putMiddlewares = [],
    deleteMiddlewares = [],
    patchMiddlewares = [],
    disablePost = false,
    disableGet = false,
    disableGetWhere = false,
    disableGetById = false,
    disablePut = false,
    disableDelete = false,
    disablePatch = false,
    disableBulkInsert = false,
    disableBulkUpdate = false,
    disableImportXls = false,
    disableExportXls = false,
    disableGetArchived = false,
  } = options;

  // Ensure addAuditFields is included on mutation routes
  const ensureAudit = (mws) =>
    mws.includes(addAuditFields) ? mws : [addAuditFields, ...mws];

  const safePost = ensureAudit(postMiddlewares);
  const safePut = ensureAudit(putMiddlewares);
  const safeDelete = ensureAudit(deleteMiddlewares);
  const safePatch = ensureAudit(patchMiddlewares);

  // --- Standard CRUD routes ---

  if (!disablePost) {
    router.post('/', ...safePost, (req, res) => controller.create(req, res));
  }

  if (!disableGet) {
    router.get('/', ...getMiddlewares, (req, res) => controller.get(req, res));
  }

  if (!disableGetWhere) {
    router.get('/where', ...getMiddlewares, (req, res) => controller.getWhere(req, res));
  }

  if (!disableGetArchived) {
    router.get('/archived', ...getMiddlewares, (req, res) => controller.getWhere(req, res));
  }

  // Ping route (always enabled)
  router.get('/ping', (_req, res) => {
    res.status(200).json({ message: 'pong' });
  });

  if (!disableGetById) {
    router.get('/:id', ...getMiddlewares, (req, res) => controller.getById(req, res));
  }

  if (!disableBulkInsert) {
    router.post('/bulk-insert', ...safePost, (req, res) => controller.bulkInsert(req, res));
  }

  if (!disableImportXls) {
    const upload = multer({ dest: '/tmp/uploads/' });
    router.post('/import-xls', ...safePost, upload.single('file'), (req, res) => controller.importXls(req, res));
  }

  if (!disableExportXls) {
    router.post('/export-xls', (req, res) => controller.exportXls(req, res));
  }

  if (!disableBulkUpdate) {
    router.put('/bulk-update', ...safePut, (req, res) => controller.bulkUpdate(req, res));
  }

  if (!disablePut) {
    router.put('/update', ...safePut, (req, res) => controller.update(req, res));
  }

  if (!disableDelete) {
    router.delete('/archive', ...safeDelete, (req, res) => controller.archive(req, res));
  }

  if (!disablePatch) {
    router.patch('/restore', ...safePatch, (req, res) => controller.restore(req, res));
  }

  // --- Custom routes ---
  if (typeof extendRoutes === 'function') {
    extendRoutes(router);
  }

  return router;
}
