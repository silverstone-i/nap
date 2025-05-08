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
// import { db } from '#db/db.js';

/**
 * Handles errors for CRUD controllers.
 * @param {Error} err
 * @param {object} res - Express response
 * @param {string} context - e.g. 'creating', 'fetching'
 * @param {string} errorLabel - model name or label
 */
export function handleError(err, res, context, errorLabel) {
  const codeMap = {
    '23505': 409, // unique_violation
    '23503': 400, // foreign_key_violation
    '22001': 400, // string_data_right_truncation
  };
  const status = codeMap[err.code] || 500;
  console.error(`Error ${context} ${errorLabel}:`, err);
  res.status(status).json({ error: err.message });
}

/**
 * Factory to generate a standard CRUD controller for a given db model
 * @param {string} modelName - key of the db object e.g., 'vendors'
 * @param {object} [extras] - optional additional methods
 * @param {string} [errorLabel=modelName] - label to use in error messages
 * @returns {object} controller
 */
export function createController(modelName, extras = {}, errorLabel = modelName) {

  const base = {
    async create(req, res) {
      console.log('Creating record:', req.body);
      
      try {
        const record = await db[modelName].insert(req.body);
        res.status(201).json(record);
      } catch (err) {
        handleError(err, res, 'creating', errorLabel);
      }
    },

    async getAll(req, res) {
      try {
        const records = await db[modelName].findAll();
        res.json(records);
      } catch (err) {
        handleError(err, res, 'fetching', errorLabel);
      }
    },

    async getById(req, res) {
      try {
        const record = await db[modelName].findById(req.params.id);        
        if (!record) return res.status(404).json({ error: `${errorLabel} not found` });
        res.json(record);
      } catch (err) {
        handleError(err, res, 'fetching', errorLabel);
      }
    },

    async update(req, res) {
      try {
        const updated = await db[modelName].update(req.params.id, req.body);
        if (!updated) return res.status(404).json({ error: `${errorLabel} not found` });
        res.json(updated);
      } catch (err) {
        handleError(err, res, 'updating', errorLabel);
      }
    },

    async remove(req, res) {
      try {
        const deleted = await db[modelName].delete(req.params.id);
        if (deleted === 0) return res.status(404).json({ error: `${errorLabel} not found` });
        res.status(204).end();
      } catch (err) {
        handleError(err, res, 'deleting', errorLabel);
      }
    },
  };

  return { ...base, ...extras };
}