import { PostingQueuesController } from '../../../modules/accounting/controllers/PostingQueuesController.js';
import postingQueuesSchema from '../../../modules/accounting/schemas/postingQueuesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(postingQueuesSchema, PostingQueuesController);