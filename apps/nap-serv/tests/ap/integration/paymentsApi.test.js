import { runExtendedCrudTests } from '../../../tests/util/runExtendedCrudTests.js';
import { v4 as uuid } from 'uuid';

describe('AP Payments API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/ap/v1/payments',
    updateField: 'method',
    updateValue: 'ach',
    beforeHook: async ctx => {
      const { db } = await import('../../../src/db/db.js');
      ctx.tenantId = uuid();
      ctx.vendorId = uuid();
      ctx.companyId = uuid();
      ctx.projectId = uuid();
      ctx.invoiceId = uuid();

      await db.none(`INSERT INTO tenantid.vendors (id, tenant_id, name, created_by) VALUES ($1, $2, $3, $4)`, [
        ctx.vendorId,
        ctx.tenantId,
        'Test Vendor',
        'integration-test',
      ]);

      await db.none(
        `INSERT INTO tenantid.inter_companies (id, tenant_id, company_code, created_by) VALUES ($1, $2, $3, $4)`,
        [ctx.companyId, ctx.tenantId, 'TESTCO', 'integration-test']
      );

      await db.none(`INSERT INTO tenantid.projects (id, tenant_id, name, created_by) VALUES ($1, $2, $3, $4)`, [
        ctx.projectId,
        ctx.tenantId,
        'Test Project',
        'integration-test',
      ]);

      await db.none(
        `INSERT INTO tenantid.ap_invoices (id, tenant_id, company_id, vendor_id, project_id, invoice_number, invoice_date, total_amount, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          ctx.invoiceId,
          ctx.tenantId,
          ctx.companyId,
          ctx.vendorId,
          ctx.projectId,
          `APINV-${Date.now()}`,
          '2025-05-01',
          1200,
          'open',
          'integration-test',
        ]
      );
    },
    testRecord: ctx => ({
      tenant_id: ctx.tenantId,
      vendor_id: ctx.vendorId,
      ap_invoice_id: ctx.invoiceId,
      payment_date: '2025-05-03',
      amount: 1200.0,
      method: 'check',
      reference: 'CHK200001',
      notes: 'Payment sent by mail',
      created_by: 'integration-test',
      updated_by: 'integration-test',
    }),
  });
});
