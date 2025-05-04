import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import ProjectController from '../../../modules/activities/controllers/ProjectController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'Project',
  controller: ProjectController,
  modelName: 'projects',
  db,
});
