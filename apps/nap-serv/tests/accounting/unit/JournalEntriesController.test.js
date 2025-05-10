import { JournalEntriesController } from '../../../modules/accounting/controllers/JournalEntriesController.js';
import journalEntriesSchema from '../../../modules/accounting/schemas/journalEntriesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(journalEntriesSchema, JournalEntriesController);