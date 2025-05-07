import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import NapUsersController from '../../../modules/tenants/controllers/NapUsersController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'NapUsers',
  controller: NapUsersController,
  modelName: 'napUsers',
  db,
});
