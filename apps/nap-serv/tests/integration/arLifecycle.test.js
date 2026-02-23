/**
 * @file Integration — AR invoice lifecycle: create → add lines → send → receive payment → paid
 * @module tests/integration/arLifecycle
 *
 * No ar_clients — invoices reference core clients table.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { bootstrapAdmin, cleanupTestDb } from '../helpers/testDb.js';

const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;
const TENANT_CODE = 'ARLIFE';
const TENANT_ADMIN_EMAIL = 'admin@arlife.com';
const TENANT_ADMIN_PASSWORD = 'ArlifePass123!';

let db;
beforeAll(async () => {
  await cleanupTestDb();
  db = await bootstrapAdmin();
}, 30000);

const { default: app } = await import('../../src/app.js');

afterAll(async () => {
  await cleanupTestDb();
}, 15000);

describe('AR Invoice Lifecycle — full workflow', () => {
  let cookies;
  let tenantSchema;
  let companyId;
  let clientId;
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
        tenant_code: TENANT_CODE, company: 'AR Lifecycle Corp', status: 'active',
        tier: 'starter', admin_email: TENANT_ADMIN_EMAIL, admin_password: TENANT_ADMIN_PASSWORD,
      });
    expect(provRes.status).toBe(201);

    const tenant = await db.one("SELECT schema_name FROM admin.tenants WHERE tenant_code = 'ARLIFE'");
    tenantSchema = tenant.schema_name;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TENANT_ADMIN_EMAIL, password: TENANT_ADMIN_PASSWORD });
    cookies = loginRes.headers['set-cookie'];
  }, 30000);

  test('2. Create prerequisites (company, client, COA accounts)', async () => {
    const icRes = await request(app).post('/api/core/v1/inter-companies').set('Cookie', cookies).send({ code: 'ARLC', name: 'AR Life Co' });
    companyId = icRes.body.id;

    const cRes = await request(app).post('/api/core/v1/clients').set('Cookie', cookies).send({ client_code: 'ARLCL', name: 'AR Life Client' });
    clientId = cRes.body.id;

    const coaRes = await request(app).post('/api/accounting/v1/chart-of-accounts').set('Cookie', cookies).send({ code: '4100', name: 'Revenue', type: 'income' });
    accountId = coaRes.body.id;
  });

  test('3. Create AR invoice (open)', async () => {
    const res = await request(app)
      .post('/api/ar/v1/ar-invoices')
      .set('Cookie', cookies)
      .send({
        client_id: clientId, company_id: companyId, invoice_number: 'ARLIFE-001',
        invoice_date: '2025-03-01', due_date: '2025-04-01', total_amount: 15000,
        status: 'open',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('open');
    invoiceId = res.body.id;

    const row = await db.one(`SELECT status, total_amount FROM ${tenantSchema}.ar_invoices WHERE id = $1`, [invoiceId]);
    expect(row.status).toBe('open');
    expect(Number(row.total_amount)).toBe(15000);
  });

  test('4. Add invoice lines', async () => {
    const res = await request(app)
      .post('/api/ar/v1/ar-invoice-lines')
      .set('Cookie', cookies)
      .send({ invoice_id: invoiceId, description: 'Design services', amount: 10000, account_id: accountId });
    expect(res.status).toBe(201);

    const res2 = await request(app)
      .post('/api/ar/v1/ar-invoice-lines')
      .set('Cookie', cookies)
      .send({ invoice_id: invoiceId, description: 'Project management', amount: 5000, account_id: accountId });
    expect(res2.status).toBe(201);

    const lines = await db.manyOrNone(`SELECT * FROM ${tenantSchema}.ar_invoice_lines WHERE invoice_id = $1`, [invoiceId]);
    expect(lines.length).toBe(2);
  });

  test('5. Send invoice (open → sent)', async () => {
    const res = await request(app)
      .put(`/api/ar/v1/ar-invoices/update?id=${invoiceId}`)
      .set('Cookie', cookies)
      .send({ status: 'sent' });
    expect(res.status).toBe(200);

    const row = await db.one(`SELECT status FROM ${tenantSchema}.ar_invoices WHERE id = $1`, [invoiceId]);
    expect(row.status).toBe('sent');
  });

  test('6. Record partial receipt', async () => {
    const res = await request(app)
      .post('/api/ar/v1/receipts')
      .set('Cookie', cookies)
      .send({
        client_id: clientId, ar_invoice_id: invoiceId, receipt_date: '2025-03-20',
        amount: 10000, method: 'wire', reference: 'WIRE-AR-001',
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.amount)).toBe(10000);
  });

  test('7. Record final receipt', async () => {
    const res = await request(app)
      .post('/api/ar/v1/receipts')
      .set('Cookie', cookies)
      .send({
        client_id: clientId, ar_invoice_id: invoiceId, receipt_date: '2025-04-01',
        amount: 5000, method: 'check', reference: 'CHK-AR-001',
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.amount)).toBe(5000);
  });

  test('8. Archive invoice', async () => {
    const res = await request(app)
      .delete(`/api/ar/v1/ar-invoices/archive?id=${invoiceId}`)
      .set('Cookie', cookies)
      .send({});
    expect(res.status).toBe(200);

    const row = await db.one(`SELECT deactivated_at FROM ${tenantSchema}.ar_invoices WHERE id = $1`, [invoiceId]);
    expect(row.deactivated_at).not.toBeNull();
  });

  test('9. Restore invoice', async () => {
    const res = await request(app)
      .patch(`/api/ar/v1/ar-invoices/restore?id=${invoiceId}`)
      .set('Cookie', cookies)
      .send({});
    expect(res.status).toBe(200);

    const row = await db.one(`SELECT deactivated_at FROM ${tenantSchema}.ar_invoices WHERE id = $1`, [invoiceId]);
    expect(row.deactivated_at).toBeNull();
  });
});
