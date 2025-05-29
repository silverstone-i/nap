import { ClientsController } from '../../../modules/ar/controllers/ClientsController.js';
import clientsSchema from '../../../modules/ar/schemas/clientsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(clientsSchema, ClientsController);
