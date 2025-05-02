'use strict';

import express from 'express';
import ProjectActivityController from '../../controllers/ProjectActivityController.js';

const router = express.Router();

// Assign an activity to a project
router
  .route('/')
  .post(ProjectActivityController.assign);

router
  .route('/:projectId')
  .get(ProjectActivityController.getAllByProject);

router
  .route('/:projectId/:activityId')
  .delete(ProjectActivityController.remove);

export default router;
