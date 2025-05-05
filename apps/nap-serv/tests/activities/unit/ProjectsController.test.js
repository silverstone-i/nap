import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import ProjectsController from '../../../modules/activities/controllers/ProjectsController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'Projects',
  controller: ProjectsController,
  modelName: 'projects',
  db,
});
