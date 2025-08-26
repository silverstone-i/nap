import 'dotenv/config';
import { db } from '../../src/db/db.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

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

export function generateTestToken(payload = {}) {
  const defaultPayload = {
    email: 'test@nap.com',
    user_name: 'test',
    tenant_code: 'tenantid',
    role: 'admin',
  };

  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) throw new Error('ACCESS_TOKEN_SECRET must be defined');
  return jwt.sign({ ...defaultPayload, ...payload }, secret, { expiresIn: '1h' });
}

export async function setupAdditionalSchemasAndUsers() {
  const adminDb = db.none;

  // Create a new schema "ciq"
  await adminDb(`DROP SCHEMA IF EXISTS ciq CASCADE`);
  await adminDb(`CREATE SCHEMA ciq`);

  // Create a second tenant and user
  const tenantModel = db.tenants;
  const userModel = db.napUsers;

  await tenantModel.insert({
    tenant_code: 'CIQ',
    company: 'CIQ Consultants',
    email: 'ciq@ciq.com',
    db_host: 'localhost',
    allowed_modules: ['projects'],
  });

  const passwordHash = await bcrypt.hash('AnotherTest123', 10);

  await userModel.insert({
    tenant_code: 'CIQ',
    schema_name: 'ciq',
    email: 'ciquser@example.com',
    password_hash: passwordHash,
    user_name: 'CIQ User',
    role: 'admin',
  });
}
