import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import ChangeOrderLinesController from '../../../modules/activities/controllers/ChangeOrderLinesController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'ChangeOrderLines',
  controller: ChangeOrderLinesController,
  modelName: 'changeOrderLines',
  db,
});
