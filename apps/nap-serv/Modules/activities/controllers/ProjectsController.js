'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { db } from '../../../src/db/db.js';

const ProjectsController = {
  async create(req, res) {
    try {
      const project = await db.projects.insert(req.body);
      res.status(201).json(project);
    } catch (err) {
      console.error('Error creating project:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const projects = await db.projects.findAll();
      res.json(projects);
    } catch (err) {
      console.error('Error fetching projects:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const project = await db.projects.findById(req.params.id);
      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }
      res.json(project);
    } catch (err) {
      console.error('Error fetching project by ID:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.projects.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating project:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      await db.projects.delete(req.params.id);
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting project:', err);
      res.status(500).json({ error: err.message });
    }
  }
};

export default ProjectsController;