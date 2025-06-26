'use strict';

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
    // console.log('Model Name:', typeof modelName === 'string' ? modelName : modelName.name);

    this.model = db[modelName];
    // console.log('Model typeof:', typeof this.model);

    const schema = this.model?.schema || {};
    this.errorLabel = errorLabel ?? schema.table ?? modelName;
    // console.log('Error Label:', this.errorLabel);
  }

  async create(req, res) {
    logger.info(`[BaseController] create`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });
    try {
      const record = await this.model.insert(req.body);
      res.status(201).json(record);
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') {
        err.message = 'Invalid input data';
      }
      handleError(err, res, 'creating', this.errorLabel);
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
      const filters = Object.entries(req.query).map(([key, value]) => ({ [key]: value }));
      const records = await this.model.findWhere(filters);
      res.json(records);
    } catch (err) {
      handleError(err, res, 'fetching', this.errorLabel);
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
      const record = await this.model.findById(req.params.id);
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
      const count = await this.model.updateWhere([{ ...req.query }], req.body);

      if (!count) {
        return res.status(404).json({ error: `${this.errorLabel} not found` });
      }
      
      const id = req.query.id || req.body.id;
      const updatedRecord = await this.model.findById(id);
      res.json(updatedRecord);
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') {
        err.message = 'Invalid input data';
      }

      handleError(err, res, 'updating', this.errorLabel);
    }
  }

  async remove(req, res) {
    logger.info(`[BaseController] remove`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });
    req.body.is_active = false; // Soft delete by marking as inactive
    const filters = [{ is_active: true }, { ...req.query }];

    try {
      const updated = await this.model.updateWhere(filters, req.body);
      if (!updated) return res.status(404).json({ error: `${this.errorLabel} not found or already inactive` });
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
    req.body.is_active = true; // Soft delete by marking as inactive
    const filters = [{ is_active: false }, { ...req.query }];

    try {
      const updated = await this.model.updateWhere(filters, req.body);
      if (!updated) return res.status(404).json({ error: `${this.errorLabel} not found or already active` });
      res.status(200).json({ message: `${this.errorLabel} marked as active` });
    } catch (err) {
      handleError(err, res, 'restoring', this.errorLabel);
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
      const result = await this.model.findAfterCursor(req.query);
      res.json(result);
    } catch (err) {
      handleError(err, res, 'fetching', this.errorLabel);
    }
  }

  async bulkInsert(req, res) {
    logger.info(`[BaseController] bulkInsert`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });
    try {
      const result = await this.model.bulkInsert(req.body);
      res.status(201).json(result);
    } catch (err) {
      handleError(err, res, 'bulk inserting', this.errorLabel);
    }
  }

  async bulkUpdate(req, res) {
    logger.info(`[BaseController] bulkUpdate`, {
      model: this.errorLabel,
      user: req.user?.email,
      query: req.query,
      body: req.body,
    });
    try {
      const filters = req.body.filters || [];
      const updates = req.body.updates || {};
      const result = await this.model.bulkUpdate(filters, updates);
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
    try {
      const result = await this.model.importFromSpreadsheet(req.body);
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
    try {
      const spreadsheet = await this.model.exportToSpreadsheet(req.body);
      res.setHeader('Content-Disposition', `attachment; filename="${this.errorLabel}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(spreadsheet);
    } catch (err) {
      handleError(err, res, 'exporting', this.errorLabel);
    }
  }
}

export default BaseController;
export { handleError }; // Export handleError for use in other controllers
