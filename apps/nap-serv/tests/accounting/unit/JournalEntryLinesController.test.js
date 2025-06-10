import { JournalEntryLinesController } from '../../../modules/accounting/controllers/JournalEntryLinesController.js';
import journalEntryLinesSchema from '../../../modules/accounting/schemas/journalEntryLinesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(journalEntryLinesSchema, JournalEntryLinesController);
