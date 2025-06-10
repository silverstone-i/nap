import { runExtendedCrudTests } from '../../../tests/util/runExtendedCrudTests.js';
import { v4 as uuid } from 'uuid';

describe('AP Invoices API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/ap/v1/ap-invoices',
    updateField: 'status',
    updateValue: 'approved',
    beforeHook: async ctx => {
      const { db } = await import('../../../src/db/db.js');
      ctx.tenantId = uuid();
      ctx.vendorId = uuid();
      ctx.companyId = uuid();
      ctx.projectId = uuid();

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
    },
    testRecord: ctx => ({
      tenant_id: ctx.tenantId,
      company_id: ctx.companyId,
      vendor_id: ctx.vendorId,
      project_id: ctx.projectId,
      invoice_number: `APINV-${Date.now()}`,
      invoice_date: '2025-05-01',
      due_date: '2025-05-15',
      total_amount: 2500,
      status: 'open',
      created_by: 'integration-test',
      updated_by: 'integration-test',
    }),
  });
});
