/**
 * @file Integration — GL posting: create journal entry → verify balance, double-entry validation
 * @module tests/integration/glPosting
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { bootstrapAdmin, cleanupTestDb } from '../helpers/testDb.js';

const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;
const TENANT_CODE = 'GLTEST';
const TENANT_ADMIN_EMAIL = 'admin@gltest.com';
const TENANT_ADMIN_PASSWORD = 'GltestPass123!';

let db;
beforeAll(async () => {
  await cleanupTestDb();
  db = await bootstrapAdmin();
}, 30000);

const { default: app } = await import('../../src/app.js');

afterAll(async () => {
  await cleanupTestDb();
}, 15000);

describe('GL Posting — journal entries, ledger balances, double-entry', () => {
  let cookies;
  let tenantSchema;
  let companyId;
  let cashAccountId;
  let expenseAccountId;
  let journalEntryId;

  test('1. Provision tenant and login', async () => {
    const rootCookies = (
      await request(app).post('/api/auth/login').send({ email: ROOT_EMAIL, password: ROOT_PASSWORD })
    ).headers['set-cookie'];

    const provRes = await request(app)
      .post('/api/tenants/v1/tenants')
      .set('Cookie', rootCookies)
      .send({
        tenant_code: TENANT_CODE, company: 'GL Test Corp', status: 'active',
        tier: 'starter', admin_email: TENANT_ADMIN_EMAIL, admin_password: TENANT_ADMIN_PASSWORD,
      });
    expect(provRes.status).toBe(201);

    const tenant = await db.one("SELECT schema_name FROM admin.tenants WHERE tenant_code = 'GLTEST'");
    tenantSchema = tenant.schema_name;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TENANT_ADMIN_EMAIL, password: TENANT_ADMIN_PASSWORD });
    cookies = loginRes.headers['set-cookie'];
  }, 30000);

  test('2. Create COA accounts (cash + expense)', async () => {
    const icRes = await request(app).post('/api/core/v1/inter-companies').set('Cookie', cookies).send({ code: 'GLCO', name: 'GL Test Co' });
    companyId = icRes.body.id;

    const cashRes = await request(app).post('/api/accounting/v1/chart-of-accounts').set('Cookie', cookies).send({ code: '1010', name: 'Operating Cash', type: 'cash' });
    cashAccountId = cashRes.body.id;
    expect(cashRes.status).toBe(201);

    const expRes = await request(app).post('/api/accounting/v1/chart-of-accounts').set('Cookie', cookies).send({ code: '5010', name: 'Office Expense', type: 'expense' });
    expenseAccountId = expRes.body.id;
    expect(expRes.status).toBe(201);
  });

  test('3. Create journal entry', async () => {
    const res = await request(app)
      .post('/api/accounting/v1/journal-entries')
      .set('Cookie', cookies)
      .send({
        entry_date: '2025-03-01',
        description: 'Office supplies purchase',
        status: 'pending',
        company_id: companyId,
      });
    expect(res.status).toBe(201);
    journalEntryId = res.body.id;

    const row = await db.one(`SELECT status FROM ${tenantSchema}.journal_entries WHERE id = $1`, [journalEntryId]);
    expect(row.status).toBe('pending');
  });

  test('4. Add balanced journal entry lines (debit expense, credit cash)', async () => {
    const debitRes = await request(app)
      .post('/api/accounting/v1/journal-entry-lines')
      .set('Cookie', cookies)
      .send({ entry_id: journalEntryId, account_id: expenseAccountId, debit: 250, credit: 0, description: 'Debit expense' });
    expect(debitRes.status).toBe(201);

    const creditRes = await request(app)
      .post('/api/accounting/v1/journal-entry-lines')
      .set('Cookie', cookies)
      .send({ entry_id: journalEntryId, account_id: cashAccountId, debit: 0, credit: 250, description: 'Credit cash' });
    expect(creditRes.status).toBe(201);

    const lines = await db.manyOrNone(
      `SELECT debit, credit FROM ${tenantSchema}.journal_entry_lines WHERE entry_id = $1`,
      [journalEntryId],
    );
    expect(lines.length).toBe(2);

    const totalDebit = lines.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = lines.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebit).toBeCloseTo(totalCredit, 2);
  });

  test('5. Verify journal entry lines exist in DB', async () => {
    const lines = await db.manyOrNone(
      `SELECT account_id, debit, credit FROM ${tenantSchema}.journal_entry_lines WHERE entry_id = $1 ORDER BY debit DESC`,
      [journalEntryId],
    );

    expect(lines[0].account_id).toBe(expenseAccountId);
    expect(Number(lines[0].debit)).toBe(250);
    expect(Number(lines[0].credit)).toBe(0);

    expect(lines[1].account_id).toBe(cashAccountId);
    expect(Number(lines[1].debit)).toBe(0);
    expect(Number(lines[1].credit)).toBe(250);
  });

  test('6. Create internal transfer between accounts', async () => {
    const res = await request(app)
      .post('/api/accounting/v1/internal-transfers')
      .set('Cookie', cookies)
      .send({
        from_account_id: cashAccountId,
        to_account_id: expenseAccountId,
        transfer_date: '2025-03-05',
        amount: 100,
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.amount)).toBe(100);

    const row = await db.one(
      `SELECT from_account_id, to_account_id, amount FROM ${tenantSchema}.internal_transfers WHERE id = $1`,
      [res.body.id],
    );
    expect(row.from_account_id).toBe(cashAccountId);
    expect(row.to_account_id).toBe(expenseAccountId);
    expect(Number(row.amount)).toBe(100);
  });
});
