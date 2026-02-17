/**
 * @file Projects controller — CRUD with status transition enforcement
 * @module projects/controllers/projectsController
 *
 * Status workflow: planning → budgeting → released → complete
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

const VALID_TRANSITIONS = {
  planning: ['budgeting'],
  budgeting: ['released'],
  released: ['complete'],
  complete: [],
};

class ProjectsController extends BaseController {
  constructor() {
    super('projects', 'project');
  }

  async create(req, res) {
    if (req.body.status && !VALID_TRANSITIONS[req.body.status]) {
      return res.status(400).json({ error: `Invalid project status: ${req.body.status}` });
    }
    return super.create(req, res);
  }

  async update(req, res) {
    if (req.body.status) {
      try {
        const schema = this.getSchema(req);
        const id = req.query.id;
        if (id) {
          const current = await this.model(schema).findById(id);
          if (!current) return res.status(404).json({ error: 'project not found' });

          const allowed = VALID_TRANSITIONS[current.status];
          if (!allowed || !allowed.includes(req.body.status)) {
            return res.status(400).json({
              error: `Invalid status transition: ${current.status} → ${req.body.status}`,
            });
          }
        }
      } catch (err) {
        return this.handleError(err, res, 'validating status for', this.errorLabel);
      }
    }
    return super.update(req, res);
  }
}

const instance = new ProjectsController();
export default instance;
export { ProjectsController, VALID_TRANSITIONS };
