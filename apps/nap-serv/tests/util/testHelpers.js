import 'dotenv/config';
import { db } from '../../src/db/db.js';
import bcrypt from 'bcrypt';

export async function setupAdminSchemaAndUser() {
  const adminDb = db.none;

  await adminDb(`DROP SCHEMA IF EXISTS admin CASCADE`);
  await adminDb(`CREATE SCHEMA admin`);

  const tenantModel = db.tenants;
  const userModel = db.napUsers;

  await tenantModel.createTable();
  await userModel.createTable();

  const passwordHash = await bcrypt.hash('TestPassword123', 10);

  await tenantModel.insert({
    tenant_code: 'NAP',
    company: 'NapSoft',
    email: 'admin@napsoft.com',
    db_host: 'localhost',
    allowed_modules: ['accounting', 'projects'],
  });

  await userModel.insert({
    tenant_code: 'NAP',
    schema_name: 'nap',
    email: 'testuser@example.com',
    password_hash: passwordHash,
    user_name: 'Test User',
    role: 'super_admin',
  });
}

