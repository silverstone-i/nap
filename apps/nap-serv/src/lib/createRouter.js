/**
 * @file createRouter — generic REST route factory for pg-schemata controllers
 * @module nap-serv/lib/createRouter
 *
 * Generates standard CRUD routes per PRD §4.1:
 *   POST /, GET /, GET /where, GET /archived, GET /ping, GET /:id,
 *   POST /bulk-insert, POST /import-xls, POST /export-xls,
 *   PUT /bulk-update, PUT /update, DELETE /archive, PATCH /restore
 *
 * Automatically applies:
 *   - addAuditFields on mutation routes (POST, PUT, DELETE, PATCH)
 *   - moduleEntitlement on all routes (checks tenant's allowed_modules)
 *
 * Middleware chain per route: [...userMws (incl. withMeta)] → moduleEntitlement → handler
 * Mutation routes additionally prepend addAuditFields before user middlewares.
 *
 * Accepts per-method middleware arrays and route disable flags.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import { addAuditFields } from '../middleware/addAuditFields.js';
import { moduleEntitlement } from '../middleware/moduleEntitlement.js';
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
  const ensureAudit = (mws) => (mws.includes(addAuditFields) ? mws : [addAuditFields, ...mws]);

  // Ensure moduleEntitlement runs after user middlewares (incl. withMeta) on all routes
  const ensureEntitlement = (mws) => (mws.includes(moduleEntitlement) ? mws : [...mws, moduleEntitlement]);

  const safeGet = ensureEntitlement(getMiddlewares);
  const safePost = ensureEntitlement(ensureAudit(postMiddlewares));
  const safePut = ensureEntitlement(ensureAudit(putMiddlewares));
  const safeDelete = ensureEntitlement(ensureAudit(deleteMiddlewares));
  const safePatch = ensureEntitlement(ensureAudit(patchMiddlewares));

  // --- Standard CRUD routes ---

  if (!disablePost) {
    router.post('/', ...safePost, (req, res) => controller.create(req, res));
  }

  if (!disableGet) {
    router.get('/', ...safeGet, (req, res) => controller.get(req, res));
  }

  if (!disableGetWhere) {
    router.get('/where', ...safeGet, (req, res) => controller.getWhere(req, res));
  }

  if (!disableGetArchived) {
    router.get('/archived', ...safeGet, (req, res) => controller.getWhere(req, res));
  }

  // Ping route (always enabled, no middleware)
  router.get('/ping', (_req, res) => {
    res.status(200).json({ message: 'pong' });
  });

  if (!disableGetById) {
    router.get('/:id', ...safeGet, (req, res) => controller.getById(req, res));
  }

  if (!disableBulkInsert) {
    router.post('/bulk-insert', ...safePost, (req, res) => controller.bulkInsert(req, res));
  }

  if (!disableImportXls) {
    const upload = multer({ dest: '/tmp/uploads/' });
    router.post('/import-xls', ...safePost, upload.single('file'), (req, res) => controller.importXls(req, res));
  }

  if (!disableExportXls) {
    router.post('/export-xls', ...ensureEntitlement(getMiddlewares), (req, res) => controller.exportXls(req, res));
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
