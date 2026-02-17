/**
 * @file Views router — GET-only export view endpoints
 * @module views/apiRoutes/v1/viewsRouter
 *
 * Simple endpoints that query export views directly via raw SQL.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import db from '../../../../src/db/db.js';
import logger from '../../../../src/utils/logger.js';

const router = Router();

/**
 * Resolve schema from request context.
 */
function getSchema(req) {
  const fromCtx = req?.ctx?.schema;
  const fromUserSchema = req?.user?.schema_name?.toLowerCase?.();
  const fromTenantCode = req?.user?.tenant_code?.toLowerCase?.();
  const schema = fromCtx || fromUserSchema || fromTenantCode;
  if (!schema) throw new Error('schemaName is required');
  return schema;
}

// Ping
router.get('/ping', (_req, res) => res.json({ message: 'pong' }));

// Export contacts
router.get('/contacts', async (req, res) => {
  try {
    const schema = getSchema(req);
    const rows = await db.manyOrNone(`SELECT * FROM ${schema}.vw_export_contacts ORDER BY name`);
    res.json(rows);
  } catch (err) {
    logger.error('Views error (contacts):', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Export addresses
router.get('/addresses', async (req, res) => {
  try {
    const schema = getSchema(req);
    const rows = await db.manyOrNone(`SELECT * FROM ${schema}.vw_export_addresses ORDER BY city`);
    res.json(rows);
  } catch (err) {
    logger.error('Views error (addresses):', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Export template cost items
router.get('/template-cost-items', async (req, res) => {
  try {
    const schema = getSchema(req);
    const rows = await db.manyOrNone(
      `SELECT * FROM ${schema}.vw_export_template_cost_items ORDER BY unit_name, task_code, item_code`,
    );
    res.json(rows);
  } catch (err) {
    logger.error('Views error (template-cost-items):', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Export template tasks
router.get('/template-tasks', async (req, res) => {
  try {
    const schema = getSchema(req);
    const rows = await db.manyOrNone(
      `SELECT * FROM ${schema}.vw_template_tasks_export ORDER BY unit_name, task_code`,
    );
    res.json(rows);
  } catch (err) {
    logger.error('Views error (template-tasks):', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

export default router;
