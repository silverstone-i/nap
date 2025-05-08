


import { runExtendedCrudTests } from '../../../tests/util/runExtendedCrudTests.js';
import { v4 as uuid } from 'uuid';

describe('AP Invoice Lines API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/ap/v1/ap-invoice-lines',
    updateField: 'amount',
    updateValue: 222.22,
    beforeHook: async (ctx) => {
      const { db } = await import('../../../src/db/db.js');
      ctx.tenantId = uuid();
      ctx.vendorId = uuid();
      ctx.companyId = uuid();
      ctx.projectId = uuid();
      ctx.invoiceId = uuid();
      ctx.costLineId = uuid();
      ctx.activityId = uuid();
      ctx.accountId = uuid();

      await db.none(`INSERT INTO tenantid.vendors (id, tenant_id, name, created_by) VALUES ($1, $2, $3, $4)`, [
        ctx.vendorId, ctx.tenantId, 'Test Vendor', 'integration-test',
      ]);

      await db.none(`INSERT INTO tenantid.inter_companies (id, tenant_id, company_code, created_by) VALUES ($1, $2, $3, $4)`, [
        ctx.companyId, ctx.tenantId, 'TESTCO', 'integration-test',
      ]);

      await db.none(`INSERT INTO tenantid.projects (id, tenant_id, name, created_by) VALUES ($1, $2, $3, $4)`, [
        ctx.projectId, ctx.tenantId, 'Test Project', 'integration-test',
      ]);

      await db.none(`INSERT INTO tenantid.chart_of_accounts (id, tenant_id, code, name, created_by) VALUES ($1, $2, $3, $4, $5)`, [
        ctx.accountId, ctx.tenantId, '5100', 'Job Costs', 'integration-test',
      ]);

      await db.none(`INSERT INTO tenantid.activities (id, tenant_id, activity_code, name, created_by) VALUES ($1, $2, $3, $4, $5)`, [
        ctx.activityId, ctx.tenantId, 'FRM-001', 'Framing', 'integration-test',
      ]);

      await db.none(`INSERT INTO tenantid.costlines (id, tenant_id, created_by) VALUES ($1, $2, $3)`, [
        ctx.costLineId, ctx.tenantId, 'integration-test',
      ]);

      await db.none(`INSERT INTO tenantid.ap_invoices (id, tenant_id, company_id, vendor_id, project_id, invoice_number, invoice_date, total_amount, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, [
        ctx.invoiceId, ctx.tenantId, ctx.companyId, ctx.vendorId, ctx.projectId,
        `APINV-${Date.now()}`, '2025-05-01', 1000, 'open', 'integration-test',
      ]);
    },
    testRecord: (ctx) => ({
      tenant_id: ctx.tenantId,
      invoice_id: ctx.invoiceId,
      cost_line_id: ctx.costLineId,
      activity_id: ctx.activityId,
      account_id: ctx.accountId,
      description: 'Subcontractor framing labor',
      amount: 875.00,
      created_by: 'integration-test',
      updated_by: 'integration-test',
    }),
  });
});