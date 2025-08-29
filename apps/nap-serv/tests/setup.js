import { generateTestToken } from './util/testHelpers.js';

const superAdminToken = generateTestToken({ role: 'superadmin' });
const regularUserToken = generateTestToken({ role: 'user' });

process.env.TEST_superadmin_JWT = superAdminToken;
process.env.TEST_REGULAR_USER_JWT = regularUserToken;
