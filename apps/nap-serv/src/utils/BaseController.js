'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import { ClientRequest } from 'http';
import { db } from '../db/db.js';
import logger from './logger.js';
import ViewController from './ViewController.js';


class BaseController extends ViewController {
  constructor(modelName, errorLabel = null) {
    super(modelName, errorLabel);
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

  async create(req, res) {
    this.injectTenantCode(req);
    try {
      const record = await this.model(req.schema).insert(req.body);
      res.status(201).json(record);
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') {
        err.message = 'Invalid input data';
      }
      this.handleError(err, res, 'creating', this.errorLabel);
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

      this.handleError(err, res, 'updating', this.errorLabel);
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
      this.handleError(err, res, 'deleting', this.errorLabel);
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
      this.handleError(err, res, 'restoring', this.errorLabel);
    }
  }

  async bulkInsert(req, res) {
    // this.injectTenantCode(req);
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
      this.handleError(err, res, 'bulk inserting', this.errorLabel);
    }
  }

  async bulkUpdate(req, res) {
    // this.injectTenantCode(req);
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
      this.handleError(err, res, 'bulk updating', this.errorLabel);
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
      this.handleError(err, res, 'importing', this.errorLabel);
    }
  }
}

export default BaseController;
