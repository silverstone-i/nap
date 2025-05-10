import { jest } from '@jest/globals';
import { AddressesController } from '../../../modules/core/controllers/AddressesController.js';
import addressesSchema from '../../../modules/core/schemas/addressesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(addressesSchema, AddressesController);