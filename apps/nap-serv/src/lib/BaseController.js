/**
 * @file BaseController — generic CRUD controller extending ViewController with write operations
 * @module nap-serv/lib/BaseController
 *
 * Adds: create, update, archive (soft-delete), restore, bulkInsert, bulkUpdate, importXls
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import logger from '../utils/logger.js';
import ViewController from './ViewController.js';

class BaseController extends ViewController {
  constructor(modelName, errorLabel = null) {
    super(modelName, errorLabel);
  }

  /**
   * POST / — insert a single record
   */
  async create(req, res) {
    try {
      const record = await this.model(this.getSchema(req)).insert(req.body);
      res.status(201).json(record);
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') err.message = 'Invalid input data';
      this.handleError(err, res, 'creating', this.errorLabel);
    }
  }

  /**
   * PUT /update — update records matching query filters
   */
  async update(req, res) {
    try {
      const count = await this.model(this.getSchema(req)).updateWhere([{ ...req.query }], req.body);
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found` });
      res.json({ updatedRecords: count });
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') err.message = 'Invalid input data';
      this.handleError(err, res, 'updating', this.errorLabel);
    }
  }

  /**
   * DELETE /archive — soft-delete records matching query filters
   */
  async archive(req, res) {
    req.body.deactivated_at = new Date();
    try {
      const filters = Array.isArray(req.query) ? req.query : [{ ...req.query }];
      const count = await this.model(this.getSchema(req)).updateWhere(filters, req.body);
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found or already inactive` });
      res.status(200).json({ message: `${this.errorLabel} marked as inactive` });
    } catch (err) {
      this.handleError(err, res, 'archiving', this.errorLabel);
    }
  }

  /**
   * PATCH /restore — reactivate soft-deleted records matching query filters
   */
  async restore(req, res) {
    req.body.deactivated_at = null;
    const filters = [{ deactivated_at: { $not: null } }, { ...req.query }];
    try {
      const count = await this.model(this.getSchema(req)).updateWhere(filters, req.body, { includeDeactivated: true });
      if (!count) return res.status(404).json({ error: `${this.errorLabel} not found or already active` });
      res.status(200).json({ message: `${this.errorLabel} marked as active` });
    } catch (err) {
      this.handleError(err, res, 'restoring', this.errorLabel);
    }
  }

  /**
   * POST /bulk-insert — insert multiple records
   */
  async bulkInsert(req, res) {
    try {
      const result = await this.model(this.getSchema(req)).bulkInsert(req.body);
      res.status(201).json(result);
    } catch (err) {
      this.handleError(err, res, 'bulk inserting', this.errorLabel);
    }
  }

  /**
   * PUT /bulk-update — update multiple records by filters
   */
  async bulkUpdate(req, res) {
    try {
      const filters = req.body.filters || [];
      const updates = req.body.updates || {};
      const result = await this.model(this.getSchema(req)).bulkUpdate(filters, updates);
      res.status(200).json(result);
    } catch (err) {
      this.handleError(err, res, 'bulk updating', this.errorLabel);
    }
  }

  /**
   * POST /import-xls — import records from uploaded spreadsheet
   */
  async importXls(req, res) {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const index = parseInt(req.body.index || '0', 10);
    try {
      const tenantCode = req.user?.tenant_code;
      const result = await this.model(this.getSchema(req)).importFromSpreadsheet(file.path, index, (row) => ({
        ...row,
        tenant_code: tenantCode,
        created_by: req.user?.id,
      }));
      res.status(201).json(result);
    } catch (err) {
      this.handleError(err, res, 'importing', this.errorLabel);
    }
  }
}

export default BaseController;
