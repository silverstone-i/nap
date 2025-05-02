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

const ProjectActivityController = {
  async assign(req, res) {
    try {
      const { project_id, activity_id } = req.body;
      const record = await db.projectActivities.insert({
        tenant_id: req.tenant_id,
        project_id,
        activity_id,
      });
      res.status(201).json(record);
    } catch (err) {
      console.error('Error assigning activity to project:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getByProject(req, res) {
    try {
      const { projectId } = req.params;
      const rows = await db.projectActivities.find({ project_id: projectId });
      res.json(rows);
    } catch (err) {
      console.error('Error fetching project activities:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      const { projectId, activityId } = req.params;
      await db.projectActivities.remove({
        project_id: projectId,
        activity_id: activityId,
        tenant_id: req.tenant_id,
      });
      res.status(204).send();
    } catch (err) {
      console.error('Error removing project activity:', err);
      res.status(500).json({ error: err.message });
    }
  },
};

export default ProjectActivityController;
