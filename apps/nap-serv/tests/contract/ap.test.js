/**
 * @file Contract tests for AP module — ap-invoices, ap-invoice-lines, payments, ap-credit-memos
 * @module tests/contract/ap
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { bootstrapAdmin, cleanupTestDb } from '../helpers/testDb.js';

const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;
const TENANT_CODE = 'APTEST';
const TENANT_ADMIN_EMAIL = 'admin@aptest.com';
const TENANT_ADMIN_PASSWORD = 'AptestPass123!';

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
      company: 'AP Test Corp',
      status: 'active',
      tier: 'starter',
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
let vendorId;
let invoiceId;
let lineId;
let paymentId;
let creditMemoId;
let accountId;

beforeAll(async () => {
  cookies = await provisionAndLogin();

  // Create prerequisite: inter-company
  const icRes = await request(app)
    .post('/api/core/v1/inter-companies')
    .set('Cookie', cookies)
    .send({ code: 'APCO', name: 'AP Test Company' });
  companyId = icRes.body.id;

  // Create prerequisite: vendor
  const vendorRes = await request(app)
    .post('/api/core/v1/vendors')
    .set('Cookie', cookies)
    .send({ code: 'APVND', name: 'AP Test Vendor' });
  vendorId = vendorRes.body.id;

  // Create prerequisite: chart of accounts entry
  const coaRes = await request(app)
    .post('/api/accounting/v1/chart-of-accounts')
    .set('Cookie', cookies)
    .send({ code: '5000', name: 'AP Expense', type: 'expense' });
  accountId = coaRes.body.id;
}, 30000);

describe('AP Invoices — /api/ap/v1/ap-invoices', () => {
  test('POST creates an AP invoice', async () => {
    const res = await request(app)
      .post('/api/ap/v1/ap-invoices')
      .set('Cookie', cookies)
      .send({
        vendor_id: vendorId,
        company_id: companyId,
        invoice_number: 'APV-001',
        invoice_date: '2025-03-01',
        due_date: '2025-04-01',
        total_amount: 5000,
        balance_due: 5000,
        status: 'open',
      });
    expect(res.status).toBe(201);
    expect(res.body.invoice_number).toBe('APV-001');
    expect(Number(res.body.total_amount)).toBe(5000);
    invoiceId = res.body.id;
  });

  test('GET lists AP invoices', async () => {
    const res = await request(app)
      .get('/api/ap/v1/ap-invoices')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /:id returns single invoice', async () => {
    const res = await request(app)
      .get(`/api/ap/v1/ap-invoices/${invoiceId}`)
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(invoiceId);
  });

  test('PUT /update updates an AP invoice', async () => {
    const res = await request(app)
      .put(`/api/ap/v1/ap-invoices/update?id=${invoiceId}`)
      .set('Cookie', cookies)
      .send({ status: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
  });
});

describe('AP Invoice Lines — /api/ap/v1/ap-invoice-lines', () => {
  test('POST creates an invoice line', async () => {
    const res = await request(app)
      .post('/api/ap/v1/ap-invoice-lines')
      .set('Cookie', cookies)
      .send({
        invoice_id: invoiceId,
        description: 'Materials',
        amount: 2500,
        account_id: accountId,
      });
    expect(res.status).toBe(201);
    expect(res.body.description).toBe('Materials');
    lineId = res.body.id;
  });

  test('GET lists invoice lines', async () => {
    const res = await request(app)
      .get('/api/ap/v1/ap-invoice-lines')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Payments — /api/ap/v1/payments', () => {
  test('POST creates a payment', async () => {
    const res = await request(app)
      .post('/api/ap/v1/payments')
      .set('Cookie', cookies)
      .send({
        vendor_id: vendorId,
        ap_invoice_id: invoiceId,
        payment_date: '2025-03-15',
        amount: 2500,
        method: 'check',
        reference: 'CHK-1001',
      });
    expect(res.status).toBe(201);
    expect(res.body.reference).toBe('CHK-1001');
    paymentId = res.body.id;
  });

  test('GET lists payments', async () => {
    const res = await request(app)
      .get('/api/ap/v1/payments')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('AP Credit Memos — /api/ap/v1/ap-credit-memos', () => {
  test('POST creates a credit memo', async () => {
    const res = await request(app)
      .post('/api/ap/v1/ap-credit-memos')
      .set('Cookie', cookies)
      .send({
        vendor_id: vendorId,
        ap_invoice_id: invoiceId,
        credit_number: 'CM-001',
        credit_date: '2025-03-10',
        amount: 500,
        reason: 'Defective materials',
        status: 'open',
      });
    expect(res.status).toBe(201);
    expect(res.body.credit_number).toBe('CM-001');
    creditMemoId = res.body.id;
  });

  test('GET lists credit memos', async () => {
    const res = await request(app)
      .get('/api/ap/v1/ap-credit-memos')
      .set('Cookie', cookies);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
  });

  test('DELETE /archive soft-deletes a credit memo', async () => {
    const res = await request(app)
      .delete(`/api/ap/v1/ap-credit-memos/archive?id=${creditMemoId}`)
      .set('Cookie', cookies)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.deactivated_at).not.toBeNull();
  });

  test('PATCH /restore unarchives a credit memo', async () => {
    const res = await request(app)
      .patch(`/api/ap/v1/ap-credit-memos/restore?id=${creditMemoId}`)
      .set('Cookie', cookies)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.deactivated_at).toBeNull();
  });
});
