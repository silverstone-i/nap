/**
 * @file Integration test — project lifecycle end-to-end
 * @module tests/integration/projectLifecycle
 *
 * Verifies: Provision tenant → create inter_company → create project →
 * add units → add tasks (with parent hierarchy) → add cost items →
 * create change order → status transitions → archive cascade.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { bootstrapAdmin, cleanupTestDb } from '../helpers/testDb.js';

const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;

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
  const res = await request(app).post('/api/auth/login').send({ email: ROOT_EMAIL, password: ROOT_PASSWORD });
  return res.headers['set-cookie'];
}

describe('Project lifecycle — full hierarchy creation, status workflow, and archive', () => {
  let tenantCookies;
  let tenantSchema;
  let companyId;
  let projectId;
  let unitId;
  let parentTaskId;
  let childTaskId;
  let costItemId;
  let changeOrderId;

  test('1. Provision tenant', async () => {
    const rootCookies = await loginRoot();
    const res = await request(app)
      .post('/api/tenants/v1/tenants')
      .set('Cookie', rootCookies)
      .send({
        tenant_code: 'PLTEST',
        company: 'Project Lifecycle Corp',
        status: 'active',
        tier: 'starter',
        admin_first_name: 'Test',
        admin_last_name: 'Admin',
        admin_email: 'admin@pltest.com',
        admin_password: 'PltestPass123!',
      });
    expect(res.status).toBe(201);

    // Get tenant schema name for direct DB queries
    const tenant = await db.one("SELECT id, schema_name FROM admin.tenants WHERE tenant_code = 'PLTEST'");
    tenantSchema = tenant.schema_name;

    // Login as tenant admin
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@pltest.com', password: 'PltestPass123!' });
    tenantCookies = loginRes.headers['set-cookie'];
    expect(tenantCookies).toBeDefined();
  }, 30000);

  test('2. Create inter-company for project FK', async () => {
    const res = await request(app)
      .post('/api/core/v1/inter-companies')
      .set('Cookie', tenantCookies)
      .send({ code: 'PLCO', name: 'Lifecycle Company', tax_id: '99-1112222' });

    expect(res.status).toBe(201);
    companyId = res.body.id;
  });

  test('3. Create project', async () => {
    const res = await request(app)
      .post('/api/projects/v1/projects')
      .set('Cookie', tenantCookies)
      .send({
        project_code: 'LIFECYCLE',
        name: 'Lifecycle Test Project',
        company_id: companyId,
        contract_amount: 500000,
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('planning');
    projectId = res.body.id;

    // Verify in DB
    const row = await db.one(`SELECT project_code, status FROM ${tenantSchema}.projects WHERE id = $1`, [projectId]);
    expect(row.project_code).toBe('LIFECYCLE');
    expect(row.status).toBe('planning');
  });

  test('4. Add unit to project', async () => {
    const res = await request(app)
      .post('/api/projects/v1/units')
      .set('Cookie', tenantCookies)
      .send({ project_id: projectId, unit_code: 'BLDG-A', name: 'Building A' });

    expect(res.status).toBe(201);
    unitId = res.body.id;
  });

  test('5. Add parent task to unit', async () => {
    const res = await request(app)
      .post('/api/projects/v1/tasks')
      .set('Cookie', tenantCookies)
      .send({ unit_id: unitId, task_code: 'FRM', name: 'Framing', duration_days: 14 });

    expect(res.status).toBe(201);
    parentTaskId = res.body.id;
  });

  test('6. Add child task with parent hierarchy', async () => {
    const res = await request(app)
      .post('/api/projects/v1/tasks')
      .set('Cookie', tenantCookies)
      .send({
        unit_id: unitId,
        task_code: 'FRM-W',
        name: 'Wall Framing',
        duration_days: 7,
        parent_task_id: parentTaskId,
      });

    expect(res.status).toBe(201);
    expect(res.body.parent_task_id).toBe(parentTaskId);
    childTaskId = res.body.id;
  });

  test('7. Add cost item to task — verify generated amount', async () => {
    const res = await request(app)
      .post('/api/projects/v1/cost-items')
      .set('Cookie', tenantCookies)
      .send({
        task_id: parentTaskId,
        item_code: 'LBR01',
        description: 'Framing labor',
        cost_class: 'labor',
        cost_source: 'budget',
        quantity: 160,
        unit_cost: 45,
      });

    expect(res.status).toBe(201);
    costItemId = res.body.id;

    // Verify generated column in DB (amount = 160 * 45 = 7200.00)
    const row = await db.one(`SELECT amount FROM ${tenantSchema}.cost_items WHERE id = $1`, [costItemId]);
    expect(Number(row.amount)).toBeCloseTo(7200.0, 2);
  });

  test('8. Create change order on unit', async () => {
    const res = await request(app)
      .post('/api/projects/v1/change-orders')
      .set('Cookie', tenantCookies)
      .send({
        unit_id: unitId,
        co_number: 'CO-101',
        title: 'Extra insulation',
        reason: 'Energy code upgrade',
        total_amount: 8500,
      });

    expect(res.status).toBe(201);
    changeOrderId = res.body.id;
  });

  test('9. Status workflow: planning → budgeting → released → complete', async () => {
    // planning → budgeting
    let res = await request(app)
      .put(`/api/projects/v1/projects/update?id=${projectId}`)
      .set('Cookie', tenantCookies)
      .send({ status: 'budgeting' });
    expect(res.status).toBe(200);

    // budgeting → released
    res = await request(app)
      .put(`/api/projects/v1/projects/update?id=${projectId}`)
      .set('Cookie', tenantCookies)
      .send({ status: 'released' });
    expect(res.status).toBe(200);

    // released → complete
    res = await request(app)
      .put(`/api/projects/v1/projects/update?id=${projectId}`)
      .set('Cookie', tenantCookies)
      .send({ status: 'complete' });
    expect(res.status).toBe(200);

    // Verify final status in DB
    const row = await db.one(`SELECT status FROM ${tenantSchema}.projects WHERE id = $1`, [projectId]);
    expect(row.status).toBe('complete');
  });

  test('10. Reject backward status transition complete → planning', async () => {
    const res = await request(app)
      .put(`/api/projects/v1/projects/update?id=${projectId}`)
      .set('Cookie', tenantCookies)
      .send({ status: 'planning' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid status transition');
  });

  test('11. Archive project', async () => {
    const res = await request(app)
      .delete(`/api/projects/v1/projects/archive?id=${projectId}`)
      .set('Cookie', tenantCookies)
      .send({});

    expect(res.status).toBe(200);

    // Verify project is archived in DB
    const row = await db.one(`SELECT deactivated_at FROM ${tenantSchema}.projects WHERE id = $1`, [projectId]);
    expect(row.deactivated_at).not.toBeNull();
  });

  test('12. Verify child records still exist (soft-delete does not cascade)', async () => {
    // Units, tasks, cost items, change orders should still exist in DB
    const unit = await db.oneOrNone(`SELECT id FROM ${tenantSchema}.units WHERE id = $1`, [unitId]);
    expect(unit).not.toBeNull();

    const task = await db.oneOrNone(`SELECT id FROM ${tenantSchema}.tasks WHERE id = $1`, [parentTaskId]);
    expect(task).not.toBeNull();

    const costItem = await db.oneOrNone(`SELECT id FROM ${tenantSchema}.cost_items WHERE id = $1`, [costItemId]);
    expect(costItem).not.toBeNull();

    const co = await db.oneOrNone(`SELECT id FROM ${tenantSchema}.change_orders WHERE id = $1`, [changeOrderId]);
    expect(co).not.toBeNull();
  });

  test('13. Restore project', async () => {
    const res = await request(app)
      .patch(`/api/projects/v1/projects/restore?id=${projectId}`)
      .set('Cookie', tenantCookies)
      .send({});

    expect(res.status).toBe(200);

    const row = await db.one(`SELECT deactivated_at FROM ${tenantSchema}.projects WHERE id = $1`, [projectId]);
    expect(row.deactivated_at).toBeNull();
  });
});
