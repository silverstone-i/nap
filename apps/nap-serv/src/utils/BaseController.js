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
    try {
      const record = await this.model.insert(req.body);
      res.status(201).json(record);
    } catch (err) {
      console.error('Error creating record:', err);
      handleError(err, res, 'creating', this.errorLabel);
    }
  }

  async get(req, res) {
    try {
      const filters = Object.entries(req.query).map(([key, value]) => ({ [key]: value }));
      const records = await this.model.findWhere(filters);
      res.json(records);
    } catch (err) {
      handleError(err, res, 'fetching', this.errorLabel);
    }
  }

  async getById(req, res) {
    try {
      const record = await this.model.findById(req.params.id);
      if (!record) return res.status(404).json({ error: `${this.errorLabel} not found` });
      res.json(record);
    } catch (err) {
      handleError(err, res, 'fetching', this.errorLabel);
    }
  }

  async update(req, res) {
    try {
      const updated = await this.model.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: `${this.errorLabel} not found` });
      res.json(updated);
    } catch (err) {
      handleError(err, res, 'updating', this.errorLabel);
    }
  }

  async remove(req, res) {
    try {
      const deleted = await this.model.delete(req.params.id);
      if (deleted === 0) return res.status(404).json({ error: `${this.errorLabel} not found` });
      res.status(204).end();
    } catch (err) {
      handleError(err, res, 'deleting', this.errorLabel);
    }
  }
}

export default BaseController;
