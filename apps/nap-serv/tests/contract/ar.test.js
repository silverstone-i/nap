/**
 * @file Contract tests for AR module — ar-invoices, ar-invoice-lines, receipts
 * @module tests/contract/ar
 *
 * No ar_clients — PRD removed ar_clients table.
 * AR invoices reference the unified clients table from core entities.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { bootstrapAdmin, cleanupTestDb } from '../helpers/testDb.js';

const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;
const TENANT_CODE = 'ARTEST';
const TENANT_ADMIN_EMAIL = 'admin@artest.com';
const TENANT_ADMIN_PASSWORD = 'ArtestPass123!';

let db;
beforeAll(async () => {
  await cleanupTestDb();
  db = await bootstrapAdmin();
}, 30000);

const { default: app } = await import('../../src/app.js');

afterAll(async () => {
  await cleanupTestDb();
}, 15000);

async function loginRoot() {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: ROOT_EMAIL, password: ROOT_PASSWORD });
  return res.headers['set-cookie'];
}

async function provisionAndLogin() {
  const rootCookies = await loginRoot();
  await request(app)
    .post('/api/tenants/v1/tenants')
    .set('Cookie', rootCookies)
    .send({
      tenant_code: TENANT_CODE,
      company: 'AR Test Corp',
      status: 'active',
      tier: 'starter',
      admin_first_name: 'Test',
      admin_last_name: 'Admin',
      admin_email: TENANT_ADMIN_EMAIL,
      admin_password: TENANT_ADMIN_PASSWORD,
    });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: TENANT_ADMIN_EMAIL, password: TENANT_ADMIN_PASSWORD });
  return loginRes.headers['set-cookie'];
}

let cookies;
let companyId;
let clientId;
let invoiceId;
let lineId;
let receiptId;
let accountId;

beforeAll(async () => {
  cookies = await provisionAndLogin();

  // Create prerequisite: inter-company
  const icRes = await request(app)
    .post('/api/core/v1/inter-companies')
    .set('Cookie', cookies)
    .send({ code: 'ARCO', name: 'AR Test Company' });
  companyId = icRes.body.id;

  // Create prerequisite: client (from core entities)
  const clientRes = await request(app)
    .post('/api/core/v1/clients')
    .set('Cookie', cookies)
    .send({ client_code: 'ARCL', name: 'AR Test Client' });
  clientId = clientRes.body.id;

  // Create prerequisite: chart of accounts entry
  const coaRes = await request(app)
    .post('/api/accounting/v1/chart-of-accounts')
    .set('Cookie', cookies)
    .send({ code: '4000', name: 'AR Revenue', type: 'income' });
  accountId = coaRes.body.id;
}, 30000);

describe('AR Invoices — /api/ar/v1/ar-invoices', () => {
  test('POST creates an AR invoice', async () => {
    const res = await request(app)
      .post('/api/ar/v1/ar-invoices')
      .set('Cookie', cookies)
      .send({
        client_id: clientId,
        company_id: companyId,
        invoice_number: 'ARI-001',
        invoice_date: '2025-03-01',
        due_date: '2025-04-01',
        total_amount: 10000,
        status: 'open',
      });
    expect(res.status).toBe(201);
    expect(res.body.invoice_number).toBe('ARI-001');
    expect(Number(res.body.total_amount)).toBe(10000);
    invoiceId = res.body.id;
  });

  test('GET lists AR invoices', async () => {
    const res = await request(app)
      .get('/api/ar/v1/ar-invoices')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /:id returns single invoice', async () => {
    const res = await request(app)
      .get(`/api/ar/v1/ar-invoices/${invoiceId}`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(invoiceId);
  });

  test('PUT /update updates an AR invoice', async () => {
    const res = await request(app)
      .put(`/api/ar/v1/ar-invoices/update?id=${invoiceId}`)
      .set('Cookie', cookies)
      .send({ notes: 'Updated via test' });
    expect(res.status).toBe(200);
  });
});

describe('AR Invoice Lines — /api/ar/v1/ar-invoice-lines', () => {
  test('POST creates an invoice line', async () => {
    const res = await request(app)
      .post('/api/ar/v1/ar-invoice-lines')
      .set('Cookie', cookies)
      .send({
        invoice_id: invoiceId,
        description: 'Consulting services',
        amount: 5000,
        account_id: accountId,
      });
    expect(res.status).toBe(201);
    expect(res.body.description).toBe('Consulting services');
    lineId = res.body.id;
  });

  test('GET lists invoice lines', async () => {
    const res = await request(app)
      .get('/api/ar/v1/ar-invoice-lines')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Receipts — /api/ar/v1/receipts', () => {
  beforeAll(async () => {
    // Move invoice to 'sent' status (required before receiving payment)
    await request(app)
      .put(`/api/ar/v1/ar-invoices/update?id=${invoiceId}`)
      .set('Cookie', cookies)
      .send({ status: 'sent' });
  });

  test('POST creates a receipt', async () => {
    const res = await request(app)
      .post('/api/ar/v1/receipts')
      .set('Cookie', cookies)
      .send({
        client_id: clientId,
        ar_invoice_id: invoiceId,
        receipt_date: '2025-03-20',
        amount: 5000,
        method: 'ach',
        reference: 'ACH-2001',
      });
    expect(res.status).toBe(201);
    expect(res.body.reference).toBe('ACH-2001');
    receiptId = res.body.id;
  });

  test('GET lists receipts', async () => {
    const res = await request(app)
      .get('/api/ar/v1/receipts')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
  });

  test('DELETE /archive soft-deletes a receipt', async () => {
    const res = await request(app)
      .delete(`/api/ar/v1/receipts/archive?id=${receiptId}`)
      .set('Cookie', cookies)
      .send({});
    expect(res.status).toBe(200);
  });

  test('PATCH /restore unarchives a receipt', async () => {
    const res = await request(app)
      .patch(`/api/ar/v1/receipts/restore?id=${receiptId}`)
      .set('Cookie', cookies)
      .send({});
    expect(res.status).toBe(200);
  });
});
