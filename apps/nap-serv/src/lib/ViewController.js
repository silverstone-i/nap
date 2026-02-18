/**
 * @file ViewController — base class for read-only CRUD operations via pg-schemata
 * @module nap-serv/lib/ViewController
 *
 * Provides: get (cursor-based), getById, getWhere, exportXls, handleError, model(), getSchema()
 *
 * Subclasses may set `this.rbacConfig` to opt into Layer 2-4 enforcement:
 *   { module: 'ar', router: 'ar-invoices', scopeColumn: 'project_id' }
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import fs from 'fs';
import db from '../db/db.js';
import logger from '../utils/logger.js';
import { buildQueryContext } from '../utils/RbacQueryContext.js';

const PG_ERROR_STATUS = {
  23505: 409, // unique_violation
  23503: 400, // foreign_key_violation
  22001: 400, // string_data_right_truncation
};

/** System roles that bypass all Layer 2-4 filtering. */
const BYPASS_ROLES = new Set(['super_user', 'admin']);

class ViewController {
  constructor(modelName, errorLabel = null) {
    if (typeof modelName !== 'string') {
      throw new Error('Invalid model name');
    }
    this.modelName = modelName;
    this.errorLabel = errorLabel ?? modelName;
    /** @type {{ module: string, router: string, scopeColumn: string } | null} */
    this.rbacConfig = null;
  }

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
   * Return a schema-bound pg-schemata model instance.
   */
  model(schemaName) {
    if (!schemaName) throw new Error('schemaName is required');
    const m = db(this.modelName, schemaName);
    if (!m) throw new Error(`Model '${this.modelName}' not found for schema '${schemaName}'`);
    return m;
  }

  /**
   * Apply RBAC Layer 2-4 filters to query conditions and options.
   * No-op when rbacConfig is null or user has a system bypass role.
   *
   * @param {object} req Express request (for perms + user role)
   * @param {Array} conditions Mutable conditions array — scope/state filters are pushed in
   * @param {object} options Mutable options object — columnWhitelist may be narrowed
   */
  _applyRbacFilters(req, conditions, options) {
    if (!this.rbacConfig) return;
    if (BYPASS_ROLES.has(req?.user?.role)) return;

    const qctx = buildQueryContext(
      req?.ctx?.perms,
      this.rbacConfig.module,
      this.rbacConfig.router,
    );

    // Layer 2: Data scope — restrict to assigned companies or projects
    if (qctx.scope === 'assigned_companies') {
      const col = this.rbacConfig.scopeColumn || 'project_id';
      if (col === 'company_id' && qctx.companyIds) {
        conditions.push({ [col]: { $in: qctx.companyIds } });
      } else if (qctx.projectIds) {
        conditions.push({ [col]: { $in: qctx.projectIds } });
      }
    } else if (qctx.scope === 'assigned_projects' && qctx.projectIds) {
      const col = this.rbacConfig.scopeColumn || 'project_id';
      conditions.push({ [col]: { $in: qctx.projectIds } });
    }

    // Layer 3: State filter — restrict to visible statuses
    if (qctx.visibleStatuses) {
      conditions.push({ status: { $in: qctx.visibleStatuses } });
    }

    // Layer 4: Field groups — restrict visible columns
    if (qctx.allowedColumns) {
      // Always include 'id' so records remain addressable
      const allowed = new Set(qctx.allowedColumns);
      allowed.add('id');

      if (options.columnWhitelist) {
        // Intersect with any caller-requested whitelist
        options.columnWhitelist = options.columnWhitelist.filter((c) => allowed.has(c));
        if (!options.columnWhitelist.length) options.columnWhitelist = ['id'];
      } else {
        options.columnWhitelist = [...allowed];
      }
    }
  }

  /**
   * Strip disallowed fields from a single record (for getById).
   * Returns the record unchanged when no field-group restriction applies.
   */
  _filterRecordFields(req, record) {
    if (!this.rbacConfig || !record) return record;
    if (BYPASS_ROLES.has(req?.user?.role)) return record;

    const qctx = buildQueryContext(
      req?.ctx?.perms,
      this.rbacConfig.module,
      this.rbacConfig.router,
    );

    if (!qctx.allowedColumns) return record;

    const allowed = new Set(qctx.allowedColumns);
    allowed.add('id');

    const filtered = {};
    for (const key of Object.keys(record)) {
      if (allowed.has(key)) filtered[key] = record[key];
    }
    return filtered;
  }

  /**
   * GET / — cursor-based pagination via findAfterCursor
   */
  async get(req, res) {
    try {
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : 50;

      let orderBy = req.query.orderBy ?? ['id'];
      if (typeof orderBy === 'string') {
        try {
          orderBy = JSON.parse(orderBy);
          if (!Array.isArray(orderBy)) throw new Error();
        } catch {
          orderBy = orderBy.split(',').map((s) => s.trim());
        }
      }

      const cursor = {};
      const filters = {};

      for (const [key, value] of Object.entries(req.query)) {
        if (key.startsWith('cursor.')) {
          cursor[key.split('.')[1]] = value;
          continue;
        }
        if (!['limit', 'orderBy', 'columnWhitelist', 'includeDeactivated', 'conditions'].includes(key)) {
          filters[key] = value;
        }
      }

      const options = { filters };

      if (req.query.columnWhitelist) {
        options.columnWhitelist = req.query.columnWhitelist.split(',').map((s) => s.trim());
      }
      if (req.query.includeDeactivated === 'true') {
        options.includeDeactivated = true;
      }

      // Apply RBAC Layers 2-4 (scope, state, field groups)
      const rbacConditions = [];
      this._applyRbacFilters(req, rbacConditions, options);

      const records = await this.model(this.getSchema(req)).findAfterCursor(cursor, limit, orderBy, {
        ...options,
        filters: { ...options.filters, ...Object.assign({}, ...rbacConditions) },
      });
      res.json(records);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /:id — find by primary key
   */
  async getById(req, res) {
    try {
      const record = await this.model(this.getSchema(req)).findById(req.params.id);
      if (!record) return res.status(404).json({ error: `${this.errorLabel} not found` });
      res.json(this._filterRecordFields(req, record));
    } catch (err) {
      this.handleError(err, res, 'fetching', this.errorLabel);
    }
  }

  /**
   * GET /where — conditional query with optional pagination
   */
  async getWhere(req, res) {
    try {
      const joinType = req.query.joinType || 'AND';
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : null;
      const offset = req.query.offset !== undefined ? Number(req.query.offset) : null;

      let orderBy = req.query.orderBy ?? null;
      if (typeof orderBy === 'string') {
        try {
          orderBy = JSON.parse(orderBy);
          if (!Array.isArray(orderBy)) throw new Error();
        } catch {
          orderBy = orderBy.split(',').map((s) => s.trim());
        }
      }

      const conditions = [];
      const filters = {};

      for (const [key, value] of Object.entries(req.query)) {
        if (key === 'conditions') {
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) conditions.push(...parsed);
          } catch {
            /* ignore parse errors */
          }
          continue;
        }
        if (
          key.startsWith('cursor.') ||
          ['limit', 'offset', 'orderBy', 'columnWhitelist', 'includeDeactivated', 'joinType'].includes(key)
        ) {
          continue;
        }
        filters[key] = value;
      }

      const options = { filters, limit, offset, orderBy };

      if (req.query.columnWhitelist) {
        options.columnWhitelist = req.query.columnWhitelist.split(',').map((s) => s.trim());
      }
      if (req.query.includeDeactivated === 'true') {
        options.includeDeactivated = true;
      }

      // Apply RBAC Layers 2-4 (scope, state, field groups)
      this._applyRbacFilters(req, conditions, options);

      const schema = this.getSchema(req);
      const [records, totalCount] = await Promise.all([
        this.model(schema).findWhere(conditions, joinType, options),
        this.model(schema).countWhere ? this.model(schema).countWhere(conditions, joinType, options) : Promise.resolve(null),
      ]);

      res.json({
        records,
        pagination:
          totalCount !== null
            ? { total: totalCount, limit: limit ?? undefined, offset: offset ?? 0 }
            : undefined,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /export-xls — export records to spreadsheet
   */
  async exportXls(req, res) {
    const timestamp = Date.now();
    const path = `/tmp/${this.errorLabel}_${timestamp}.xlsx`;
    const where = Array.isArray(req.body?.where) ? req.body.where : [];
    const joinType = req.body?.joinType || 'AND';
    const options = req.body?.options || {};

    try {
      const result = await this.model(this.getSchema(req)).exportToSpreadsheet(path, where, joinType, options);
      res.download(result.filePath, `${this.errorLabel}_${timestamp}.xlsx`, (err) => {
        if (err) logger.error(`Error sending file: ${err.message}`);
        fs.unlink(result.filePath, (unlinkErr) => {
          if (unlinkErr) logger.error(`Failed to delete exported file: ${unlinkErr.message}`);
        });
      });
    } catch (err) {
      this.handleError(err, res, 'exporting', this.errorLabel);
    }
  }

  /**
   * Map PG error codes to HTTP status codes and send error response.
   */
  handleError(err, res, context, errorLabel) {
    const status = PG_ERROR_STATUS[err.code] || 500;
    logger.error(`Error ${context} ${errorLabel}:`, { error: err.message });
    res.status(status).json({ error: err.message });
  }
}

export default ViewController;
