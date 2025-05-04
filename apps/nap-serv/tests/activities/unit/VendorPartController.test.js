

import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import VendorPartController from '../../../modules/activities/controllers/VendorPartController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'VendorPart',
  controller: VendorPartController,
  modelName: 'vendorParts',
  db,
});