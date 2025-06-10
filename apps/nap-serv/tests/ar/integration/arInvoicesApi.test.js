import { runExtendedCrudTests } from '../../../tests/util/runExtendedCrudTests.js';
import { v4 as uuid } from 'uuid';

describe('AR Invoices API', () => {
  runExtendedCrudTests({
    routePrefix: '/api/ar/v1/ar-invoices',
    updateField: 'status',
    updateValue: 'paid',
    beforeHook: async ctx => {
      const { db } = await import('../../../src/db/db.js');

      ctx.tenantId = uuid();
      ctx.clientId = uuid();
      ctx.companyId = uuid();
      ctx.deliverableId = uuid();

      await db.none(
        `INSERT INTO tenantid.clients (id, tenant_id, client_code, name, created_by) VALUES ($1, $2, $3, $4, $5)`,
        [ctx.clientId, ctx.tenantId, 'CLNT01', 'Test Client', 'integration-test']
      );

      await db.none(
        `INSERT INTO tenantid.inter_companies (id, tenant_id, company_name, created_by) VALUES ($1, $2, $3, $4)`,
        [ctx.companyId, ctx.tenantId, 'Test Company', 'integration-test']
      );

      await db.none(
        `INSERT INTO tenantid.deliverables (id, tenant_id, deliverable_code, name, created_by) VALUES ($1, $2, $3, $4, $5)`,
        [ctx.deliverableId, ctx.tenantId, 'UNIT01', 'Test Unit', 'integration-test']
      );
    },
    testRecord: ctx => ({
      tenant_id: ctx.tenantId,
      company_id: ctx.companyId,
      client_id: ctx.clientId,
      deliverable_id: ctx.deliverableId,
      invoice_number: `INV-${Date.now()}`,
      invoice_date: '2025-05-01',
      due_date: '2025-05-15',
      total_amount: 5000,
      status: 'open',
      updated_by: 'integration-test',
      created_by: 'integration-test',
    }),
  });
});
