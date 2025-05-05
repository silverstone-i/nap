

import { jest } from '@jest/globals';
import { db } from '../../../src/db/db.js';
import VendorPartsController from '../../../modules/activities/controllers/VendorPartsController.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

runControllerCrudUnitTests({
  name: 'VendorParts',
  controller: VendorPartsController,
  modelName: 'vendorParts',
  db,
});