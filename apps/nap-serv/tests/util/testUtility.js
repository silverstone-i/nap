import { setupIntegrationTest } from './integrationHarness.js';
import { db, pgp } from '../../src/db/db.js';

const schemaList = ['tenantid'];

await setupIntegrationTest(schemaList);
