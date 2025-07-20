'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import fs from 'fs';
import { db } from '../db/db.js';
import logger from './logger.js';

const codeMap = {
  23505: 409, // unique_violation
  23503: 400, // foreign_key_violation
  22001: 400, // string_data_right_truncation
};
class ViewController {
  constructor(modelName, errorLabel = null) {
    if (typeof modelName !== 'string') {
      throw new Error('Invalid model name');
    }

    this.modelName = modelName;
    this.errorLabel = errorLabel ?? modelName;
  }

  /**
   * Returns the model instance for the given schema name.
   * Throws if schemaName is not provided or model is not found.
   */
  model(schemaName) {
    if (!schemaName) throw new Error('schemaName is required');
    const model = db(this.modelName, schemaName);
    if (!model) throw new Error(`Model '${this.modelName}' not found for schema '${schemaName}'`);
    return model;
  }

  async get(req, res) {
    logger.info(`[ViewController] get`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });
    try {
      const limit = req.query.limit !== undefined ? Number(req.query.limit) : 50;
      const joinType = req.query.joinType || 'AND';

      let orderBy = req.query.orderBy ?? ['id'];
      if (typeof orderBy === 'string') {
        try {
          orderBy = JSON.parse(orderBy);
          if (!Array.isArray(orderBy)) throw new Error();
        } catch {
          orderBy = orderBy.split(',').map(s => s.trim());
        }
      }

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
      res.status(500).json({ error: err.message });
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
      this.handleError(err, res, 'fetching', this.errorLabel);
    }
  }

  async getWhere(req, res) {
    logger.info(`[ViewController] getWhere`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });

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
          orderBy = orderBy.split(',').map(s => s.trim());
        }
      }

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
      res.status(500).json({ error: err.message });
    }
  }

  async exportXls(req, res) {
    logger.info(`[BaseController] exportXls`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });

    const timestamp = Date.now();
    const path = `/tmp/${this.errorLabel}_${timestamp}.xlsx`;
    console.log('Exporting to:', path);

    const where = Array.isArray(req.body?.where) ? req.body.where : [];
    const joinType = req.body?.joinType || 'AND';
    const options = req.body?.options || {};

    try {
      const result = await this.model(req.schema).exportToSpreadsheet(path, where, joinType, options);
      res.download(result.filePath, `${this.errorLabel}_${timestamp}.xlsx`, err => {
        if (err) {
          logger.error(`Error sending file: ${err.message}`);
        }
        fs.unlink(result.filePath, err => {
          if (err) logger.error(`Failed to delete exported file: ${err.message}`);
        });
      });
    } catch (err) {
      this.handleError(err, res, 'exporting', this.errorLabel);
    }
  }

  handleError(err, res, context, errorLabel) {
    const status = codeMap[err.code] || 500;

    console.error(`Error ${context} ${errorLabel}:`, err);
    res.status(status).json({ error: err.message });
  }
}

export default ViewController;
