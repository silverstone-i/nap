import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import ChangeOrderLineController from '../../../modules/activities/controllers/ChangeOrderLineController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'ChangeOrderLine',
  controller: ChangeOrderLineController,
  modelName: 'changeOrderLines',
  db,
});
