import { jest } from '@jest/globals';
import { ContactsController } from '../../../modules/core/controllers/ContactsController.js';
import contactsSchema from '../../../modules/core/schemas/contactsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(contactsSchema, ContactsController);