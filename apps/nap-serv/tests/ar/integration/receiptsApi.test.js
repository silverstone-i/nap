import { runExtendedCrudTests } from '../../../tests/util/runExtendedCrudTests.js';
import { v4 as uuid } from 'uuid';

describe('Receipts API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/ar/v1/receipts',
    updateField: 'method',
    updateValue: 'ach',
    beforeHook: async ctx => {
      const { db } = await import('../../../src/db/db.js');
      ctx.tenantId = uuid();
      ctx.clientId = uuid();
      ctx.invoiceId = uuid();
      ctx.companyId = uuid();
      ctx.deliverableId = uuid();

      await db.none(
        `INSERT INTO tenantid.clients (id, tenant_id, client_code, name, created_by) VALUES ($1, $2, $3, $4, $5)`,
        [ctx.clientId, ctx.tenantId, 'CLNT01', 'Test Client', 'integration-test']
      );

      await db.none(
        `INSERT INTO tenantid.inter_companies (id, tenant_id, company_code, created_by) VALUES ($1, $2, $3, $4)`,
        [ctx.companyId, ctx.tenantId, 'TESTCO', 'integration-test']
      );

      await db.none(
        `INSERT INTO tenantid.deliverables (id, tenant_id, deliverable_code, name, created_by) VALUES ($1, $2, $3, $4, $5)`,
        [ctx.deliverableId, ctx.tenantId, 'UNIT01', 'Test Unit', 'integration-test']
      );

      await db.none(
        `INSERT INTO tenantid.ar_invoices (id, tenant_id, company_id, client_id, deliverable_id, invoice_number, invoice_date, due_date, total_amount, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          ctx.invoiceId,
          ctx.tenantId,
          ctx.companyId,
          ctx.clientId,
          ctx.deliverableId,
          `INV-${Date.now()}`,
          '2025-05-01',
          '2025-05-15',
          1000,
          'open',
          'integration-test',
        ]
      );
    },
    testRecord: ctx => ({
      tenant_id: ctx.tenantId,
      client_id: ctx.clientId,
      ar_invoice_id: ctx.invoiceId,
      receipt_date: '2025-05-02',
      amount: 1000.0,
      method: 'check',
      reference: 'CHK123456',
      notes: 'Payment received.',
      created_by: 'integration-test',
      updated_by: 'integration-test',
    }),
  });
});
