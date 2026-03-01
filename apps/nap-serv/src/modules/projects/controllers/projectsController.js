/**
 * @file Projects controller — CRUD with status transition enforcement
 * @module projects/controllers/projectsController
 *
 * Status workflow: planning → budgeting → released → complete (forward-only).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db from '../../../db/db.js';
import { allocateNumber } from '../../../system/core/services/index.js';

const VALID_TRANSITIONS = {
  planning: ['budgeting'],
  budgeting: ['released'],
  released: ['complete'],
  complete: [],
};

class ProjectsController extends BaseController {
  constructor() {
    super('projects');
  }

  /**
   * POST / — inject tenant_id from auth session, auto-number project_code if not provided.
   */
  async create(req, res) {
    try {
      if (!req.body.tenant_id && req.user?.tenant_id) {
        req.body.tenant_id = req.user.tenant_id;
      }

      const schema = this.getSchema(req);

      const record = await db.tx(async (t) => {
        const projectsModel = this.model(schema);
        projectsModel.tx = t;

        const project = await projectsModel.insert(req.body);

        // Auto-assign project_code via numbering service (if enabled and code not provided)
        if (!project.project_code) {
          const numbering = await allocateNumber(schema, 'project', null, new Date(), t);
          if (numbering) {
            await t.none(`UPDATE ${schema}.projects SET project_code = $1 WHERE id = $2`, [
              numbering.displayId,
              project.id,
            ]);
            project.project_code = numbering.displayId;
          }
        }

        return project;
      });

      res.status(201).json(record);
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') err.message = 'Invalid input data';
      this.handleError(err, res, 'creating', this.errorLabel);
    }
  }

  /**
   * PUT /update — validate status transitions when status is being changed.
   */
  async update(req, res) {
    if (req.body.status) {
      try {
        const schema = this.getSchema(req);
        const id = req.query.id;
        if (id) {
          const current = await this.model(schema).findById(id);
          if (!current) return res.status(404).json({ error: 'Project not found' });

          const allowed = VALID_TRANSITIONS[current.status] || [];
          if (!allowed.includes(req.body.status)) {
            return res.status(400).json({
              error: `Invalid status transition: ${current.status} → ${req.body.status}`,
              allowed,
            });
          }
        }
      } catch (err) {
        return this.handleError(err, res, 'validating status for', 'project');
      }
    }
    return super.update(req, res);
  }
}

const instance = new ProjectsController();
export default instance;
export { ProjectsController, VALID_TRANSITIONS };
