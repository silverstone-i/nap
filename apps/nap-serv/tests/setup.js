import { generateTestToken } from './util/testHelpers.js';

const super_adminToken = generateTestToken({ role: 'super_admin' });
const regularUserToken = generateTestToken({ role: 'user' });

process.env.TEST_super_admin_JWT = super_adminToken;
process.env.TEST_REGULAR_USER_JWT = regularUserToken;
