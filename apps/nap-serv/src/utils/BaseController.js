'use strict';

import { ClientRequest } from 'http';
import fs from 'fs';
/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { db } from '../db/db.js';
import logger from './logger.js';

const codeMap = {
  23505: 409, // unique_violation
  23503: 400, // foreign_key_violation
  22001: 400, // string_data_right_truncation
};

function handleError(err, res, context, errorLabel) {
  const status = codeMap[err.code] || 500;

  console.error(`Error ${context} ${errorLabel}:`, err);
  res.status(status).json({ error: err.message });
}

class BaseController {
  constructor(modelName, errorLabel = null) {
    if (typeof modelName !== 'string') {
      throw new Error('Invalid model name');
    }

    this.modelName = modelName;
    this.errorLabel = errorLabel ?? modelName;
  }

  injectTenantCode(req) {
    const tenantCode = req.user?.tenant_code;
    const userName = req.user?.user_name || req.user?.email;
    if (!tenantCode) return;

    if (Array.isArray(req.body)) {
      req.body = req.body.map(row => ({ ...row, tenant_code: tenantCode, created_by: userName }));
    } else if (typeof req.body === 'object' && req.body !== null) {
      if (req.body.updates && Array.isArray(req.body.updates)) {
        req.body.updates = req.body.updates.map(row => ({ ...row, tenant_code: tenantCode, updated_by: userName }));
      } else {
        req.body.tenant_code = tenantCode;
        req.body.created_by = userName;
      }
    }
  }

  model(schemaName) {
    if (!schemaName) throw new Error('schemaName is required');

    const model = db(this.modelName, schemaName);
    if (!model) throw new Error(`Model '${this.modelName}' not found for schema '${schemaName}'`);
    return model;
  }

  async create(req, res) {
    this.injectTenantCode(req);
    try {
      const record = await this.model(req.schema).insert(req.body);
      res.status(201).json(record);
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') {
        err.message = 'Invalid input data';
      }
      handleError(err, res, 'creating', this.errorLabel);
    }
  }

  async get(req, res) {
    logger.info(`[BaseController] get`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });
    try {
      console.log('[BaseController] get query:', req.query);

      // Parse limit as number
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : 50;
      const joinType = req.query.joinType || 'AND';

      // Parse orderBy from string, CSV or JSON
      let orderBy = req.query.orderBy ?? ['id'];
      if (typeof orderBy === 'string') {
        try {
          orderBy = JSON.parse(orderBy);
          if (!Array.isArray(orderBy)) throw new Error();
        } catch {
          orderBy = orderBy.split(',').map(s => s.trim());
        }
      }

      // Extract cursor from query params like cursor.{key}
      const cursor = {};
      const conditions = [];
      const filters = {};

      for (const [key, value] of Object.entries(req.query)) {
        if (key.startsWith('cursor.')) {
          const keyName = key.split('.')[1];
          cursor[keyName] = value;
          continue;
        }

        if (!['limit', 'orderBy', 'columnWhitelist', 'includeDeactivated'].includes(key)) {
          filters[key] = value;
        }
      }

      const options = { filters };

      if (req.query.columnWhitelist) {
        options.columnWhitelist = req.query.columnWhitelist.split(',').map(s => s.trim());
      }

      if (req.query.includeDeactivated === 'true') {
        options.includeDeactivated = true;
      }

      const records = await this.model(req.schema).findAfterCursor(cursor, limit, orderBy, options);

      if (conditions.length > 0) {
        records.warning = 'Conditions were ignored in cursor-based pagination.';
      }

      res.json(records);
    } catch (err) {
      handleError(err, res, 'fetching', this.errorLabel);
    }
  }

  async getWhere(req, res) {
    logger.info(`[BaseController] getWhere`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });

    try {
      const joinType = req.query.joinType || 'AND';
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : null;
      const offset = req.query.offset !== undefined ? Number(req.query.offset) : null;

      // Parse orderBy from JSON, CSV or string
      let orderBy = req.query.orderBy ?? null;
      if (typeof orderBy === 'string') {
        try {
          orderBy = JSON.parse(orderBy);
          if (!Array.isArray(orderBy)) throw new Error();
        } catch {
          orderBy = orderBy.split(',').map(s => s.trim());
        }
      }

      // Extract conditions and filters correctly
      const conditions = [];
      const filters = {};

      for (const [key, value] of Object.entries(req.query)) {
        if (key === 'conditions') {
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
              conditions.push(...parsed);
            }
          } catch {}
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

      const options = {
        filters,
        limit,
        offset,
        orderBy,
      };

      if (req.query.columnWhitelist) {
        options.columnWhitelist = req.query.columnWhitelist.split(',').map(s => s.trim());
      }

      if (req.query.includeDeactivated === 'true') {
        options.includeDeactivated = true;
      }

      const [records, totalCount] = await Promise.all([
        this.model(req.schema).findWhere(conditions, joinType, options),
        this.model(req.schema).countWhere ? this.model(req.schema).countWhere(conditions, joinType, options) : Promise.resolve(null),
      ]);

      res.json({
        records,
        pagination:
          totalCount !== null
            ? {
                total: totalCount,
                limit: limit ?? undefined,
                offset: offset ?? 0,
              }
            : undefined,
      });
    } catch (err) {
      handleError(err, res, 'fetching', this.errorLabel);
    }
  }

  async getArchived(req, res) {
    logger.info(`[BaseController] getArchived`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
    });

    try {
      const joinType = req.query.joinType || 'AND';
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : null;
      const offset = req.query.offset !== undefined ? Number(req.query.offset) : null;

      let orderBy = req.query.orderBy ?? 'id';
      if (typeof orderBy === 'string') {
        try {
          orderBy = JSON.parse(orderBy);
          if (!Array.isArray(orderBy)) throw new Error();
        } catch {
          orderBy = orderBy.split(',').map(s => s.trim());
        }
      }

      const options = {
        limit,
        offset,
        orderBy,
      };

      if (req.query.columnWhitelist) {
        options.columnWhitelist = req.query.columnWhitelist.split(',').map(s => s.trim());
      }

      // Build filters from query params
      const filters = {};
      for (const [key, value] of Object.entries(req.query)) {
        if (
          key.startsWith('cursor.') ||
          ['limit', 'offset', 'orderBy', 'columnWhitelist', 'includeDeactivated', 'joinType'].includes(key)
        ) {
          continue;
        }
        filters[key] = value;
      }
      options.filters = filters;

      const conditions = [];
      const records = await this.model(req.schema).findSoftDeleted(conditions, joinType, options);

      res.json({ records });
    } catch (err) {
      handleError(err, res, 'fetching archived', this.errorLabel);
    }
  }

  async getById(req, res) {
    logger.info(`[BaseController] getById`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });
    try {
      const record = await this.model(req.schema).findById(req.params.id);
      if (!record) return res.status(404).json({ error: `${this.errorLabel} not found` });
      res.json(record);
    } catch (err) {
      handleError(err, res, 'fetching', this.errorLabel);
    }
  }

  async update(req, res) {
    logger.info(`[BaseController] update`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });
    try {
      const count = await this.model(req.schema).updateWhere([{ ...req.query }], req.body);

      if (!count) {
        return res.status(404).json({ error: `${this.errorLabel} not found` });
      }
      res.json({ updatedRecords: count });
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') {
        err.message = 'Invalid input data';
      }

      handleError(err, res, 'updating', this.errorLabel);
    }
  }

  async archive(req, res) {
    logger.info(`[BaseController] archive`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });

    req.body.deactivated_at = new Date(); // Soft delete by marking as inactive
    // const filters = [{ deactivated_at: {$is: null} }, { ...req.query }];

    try {
      const count = await this.model(req.schema).updateWhere(req.query, req.body);
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found or already inactive` });
      res.status(200).json({ message: `${this.errorLabel} marked as inactive` });
    } catch (err) {
      handleError(err, res, 'deleting', this.errorLabel);
    }
  }

  async restore(req, res) {
    logger.info(`[BaseController] restore`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });
    req.body.deactivated_at = null; // Soft delete by marking as inactive
    const filters = [{ deactivated_at: { $not: null } }, { ...req.query }];

    try {
      const count = await this.model(req.schema).updateWhere(filters, req.body, { includeDeactivated: true });
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found or already active` });

      res.status(200).json({ message: `${this.errorLabel} marked as active` });
    } catch (err) {
      handleError(err, res, 'restoring', this.errorLabel);
    }
  }

  async bulkInsert(req, res) {
    this.injectTenantCode(req);
    logger.info(`[BaseController] bulkInsert`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });
    try {
      const result = await this.model(req.schema).bulkInsert(req.body);
      res.status(201).json(result);
    } catch (err) {
      handleError(err, res, 'bulk inserting', this.errorLabel);
    }
  }

  async bulkUpdate(req, res) {
    this.injectTenantCode(req);
    logger.info(`[BaseController] bulkUpdate`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });
    try {
      const filters = req.body.filters || [];
      const updates = req.body.updates || {};
      const result = await this.model(req.schema).bulkUpdate(filters, updates);
      res.status(200).json(result);
    } catch (err) {
      handleError(err, res, 'bulk updating', this.errorLabel);
    }
  }

  async importXls(req, res) {
    logger.info(`[BaseController] importXls`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });
    const file = req.file; // multer stores the uploaded file in req.file
    const index = parseInt(req.body.index || '0', 10);
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    try {
      const tenantCode = req.user?.tenant_code;
      const result = await this.model(req.schema).importFromSpreadsheet(file.path, index, row => ({
        ...row,
        tenant_code: tenantCode,
        created_by: req.user?.user_name || req.user?.email,
      }));
      res.status(201).json(result);
    } catch (err) {
      handleError(err, res, 'importing', this.errorLabel);
    }
  }

  async exportXls(req, res) {
    logger.info(`[BaseController] exportXls`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });

    const path = `/tmp/${this.errorLabel}-${Date.now()}.xlsx`;
    const where = Array.isArray(req.body?.where) ? req.body.where : [];
    const joinType = req.body?.joinType || 'AND';
    const options = req.body?.options || {};

    try {
      const result = await this.model(req.schema).exportToSpreadsheet(path, where, joinType, options);
      res.setHeader('Content-Disposition', `attachment; filename="${this.errorLabel}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      // TODO: Handle file cleanup after download.  May need to use a temporary file system or cloud storage like Amazon S3.
      // For now, just send the file and let the client handle it.
      res.download(result.filePath, `${this.errorLabel}_${Date.now()}.xlsx`, err => {
        if (err) {
          logger.error(`Error sending file: ${err.message}`);
        }
        fs.unlink(result.filePath, err => {
          if (err) logger.error(`Failed to delete exported file: ${err.message}`);
        });
      });
    } catch (err) {
      handleError(err, res, 'exporting', this.errorLabel);
    }
  }
}

export default BaseController;
export { handleError }; // Export handleError for use in other controllers
