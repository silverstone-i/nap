import { generateTestToken } from './util/tokenUtil.js';

const superAdminToken = generateTestToken({ role: 'super_admin' });
const regularUserToken = generateTestToken({ role: 'user' });

process.env.TEST_SUPER_ADMIN_JWT = superAdminToken;
process.env.TEST_REGULAR_USER_JWT = regularUserToken;
