/**
 * @file Integration — AP invoice lifecycle: create → add lines → approve → pay → status transitions
 * @module tests/integration/apLifecycle
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { bootstrapAdmin, cleanupTestDb } from '../helpers/testDb.js';

const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;
const TENANT_CODE = 'APLIFE';
const TENANT_ADMIN_EMAIL = 'admin@aplife.com';
const TENANT_ADMIN_PASSWORD = 'AplifePass123!';

let db;
beforeAll(async () => {
  await cleanupTestDb();
  db = await bootstrapAdmin();
}, 30000);

const { default: app } = await import('../../src/app.js');

afterAll(async () => {
  await cleanupTestDb();
}, 15000);

describe('AP Invoice Lifecycle — full workflow', () => {
  let cookies;
  let tenantSchema;
  let companyId;
  let vendorId;
  let accountId;
  let invoiceId;

  test('1. Provision tenant and login', async () => {
    const rootCookies = (
      await request(app).post('/api/auth/login').send({ email: ROOT_EMAIL, password: ROOT_PASSWORD })
    ).headers['set-cookie'];

    const provRes = await request(app)
      .post('/api/tenants/v1/tenants')
      .set('Cookie', rootCookies)
      .send({
        tenant_code: TENANT_CODE, company: 'AP Lifecycle Corp', status: 'active',
        tier: 'starter', admin_first_name: 'Test', admin_last_name: 'Admin',
        admin_email: TENANT_ADMIN_EMAIL, admin_password: TENANT_ADMIN_PASSWORD,
      });
    expect(provRes.status).toBe(201);

    const tenant = await db.one("SELECT schema_name FROM admin.tenants WHERE tenant_code = 'APLIFE'");
    tenantSchema = tenant.schema_name;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TENANT_ADMIN_EMAIL, password: TENANT_ADMIN_PASSWORD });
    cookies = loginRes.headers['set-cookie'];
  }, 30000);

  test('2. Create prerequisites (company, vendor, COA accounts)', async () => {
    const icRes = await request(app).post('/api/core/v1/inter-companies').set('Cookie', cookies).send({ code: 'APLC', name: 'AP Life Co' });
    companyId = icRes.body.id;

    const vRes = await request(app).post('/api/core/v1/vendors').set('Cookie', cookies).send({ code: 'APLV', name: 'AP Life Vendor' });
    vendorId = vRes.body.id;

    const coaRes = await request(app).post('/api/accounting/v1/chart-of-accounts').set('Cookie', cookies).send({ code: '5100', name: 'Expense', type: 'expense' });
    accountId = coaRes.body.id;
  });

  test('3. Create AP invoice (open)', async () => {
    const res = await request(app)
      .post('/api/ap/v1/ap-invoices')
      .set('Cookie', cookies)
      .send({
        vendor_id: vendorId, company_id: companyId, invoice_number: 'APLIFE-001',
        invoice_date: '2025-03-01', due_date: '2025-04-01', total_amount: 10000,
        status: 'open',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('open');
    invoiceId = res.body.id;

    const row = await db.one(`SELECT status, total_amount FROM ${tenantSchema}.ap_invoices WHERE id = $1`, [invoiceId]);
    expect(row.status).toBe('open');
    expect(Number(row.total_amount)).toBe(10000);
  });

  test('4. Add invoice lines', async () => {
    const res = await request(app)
      .post('/api/ap/v1/ap-invoice-lines')
      .set('Cookie', cookies)
      .send({ invoice_id: invoiceId, description: 'Materials', amount: 7000, account_id: accountId });
    expect(res.status).toBe(201);

    const res2 = await request(app)
      .post('/api/ap/v1/ap-invoice-lines')
      .set('Cookie', cookies)
      .send({ invoice_id: invoiceId, description: 'Labor', amount: 3000, account_id: accountId });
    expect(res2.status).toBe(201);

    const lines = await db.manyOrNone(`SELECT * FROM ${tenantSchema}.ap_invoice_lines WHERE invoice_id = $1`, [invoiceId]);
    expect(lines.length).toBe(2);
  });

  test('5. Approve invoice (open → approved)', async () => {
    const res = await request(app)
      .put(`/api/ap/v1/ap-invoices/update?id=${invoiceId}`)
      .set('Cookie', cookies)
      .send({ status: 'approved' });
    expect(res.status).toBe(200);

    const row = await db.one(`SELECT status FROM ${tenantSchema}.ap_invoices WHERE id = $1`, [invoiceId]);
    expect(row.status).toBe('approved');
  });

  test('6. Record partial payment', async () => {
    const res = await request(app)
      .post('/api/ap/v1/payments')
      .set('Cookie', cookies)
      .send({
        vendor_id: vendorId, ap_invoice_id: invoiceId, payment_date: '2025-03-15',
        amount: 6000, method: 'wire', reference: 'WIRE-001',
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.amount)).toBe(6000);
  });

  test('7. Record final payment', async () => {
    const res = await request(app)
      .post('/api/ap/v1/payments')
      .set('Cookie', cookies)
      .send({
        vendor_id: vendorId, ap_invoice_id: invoiceId, payment_date: '2025-03-25',
        amount: 4000, method: 'ach', reference: 'ACH-001',
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.amount)).toBe(4000);
  });

  test('8. Archive invoice', async () => {
    const res = await request(app)
      .delete(`/api/ap/v1/ap-invoices/archive?id=${invoiceId}`)
      .set('Cookie', cookies)
      .send({});
    expect(res.status).toBe(200);

    const row = await db.one(`SELECT deactivated_at FROM ${tenantSchema}.ap_invoices WHERE id = $1`, [invoiceId]);
    expect(row.deactivated_at).not.toBeNull();
  });

  test('9. Restore invoice', async () => {
    const res = await request(app)
      .patch(`/api/ap/v1/ap-invoices/restore?id=${invoiceId}`)
      .set('Cookie', cookies)
      .send({});
    expect(res.status).toBe(200);

    const row = await db.one(`SELECT deactivated_at FROM ${tenantSchema}.ap_invoices WHERE id = $1`, [invoiceId]);
    expect(row.deactivated_at).toBeNull();
  });
});
