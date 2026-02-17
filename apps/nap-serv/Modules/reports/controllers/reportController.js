/**
 * @file ReportController — lightweight base for report endpoints
 * @module reports/controllers/reportController
 *
 * Provides getSchema(req) resolution (same logic as ViewController) and
 * handleError() for consistent error responses. No model binding — report
 * controllers use raw SQL via db.manyOrNone / db.oneOrNone against views.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import logger from '../../../src/utils/logger.js';

class ReportController {
  /**
   * Resolve the schema name from the request context.
   */
  getSchema(req) {
    const fromCtx = req?.ctx?.schema;
    const fromUserSchema = req?.user?.schema_name?.toLowerCase?.();
    const fromTenantCode = req?.user?.tenant_code?.toLowerCase?.();
    const schema = fromCtx || fromUserSchema || fromTenantCode;
    if (!schema) throw new Error('schemaName is required');
    return schema;
  }

  /**
   * Standard error handler for report endpoints.
   */
  handleError(err, res, context) {
    logger.error(`Report error (${context}):`, { error: err.message });
    res.status(500).json({ error: err.message });
  }
}

export default ReportController;
