/**
 * @file Integration test — BOM matching workflow end-to-end
 * @module tests/integration/bomMatching
 *
 * Verifies: Provision tenant → create catalog SKU → create vendor SKU →
 * embed descriptions → find similar → auto-match → verify match_review_logs.
 *
 * NOTE: Embedding/matching tests that rely on the OpenAI API are skipped
 * unless OPENAI_API_KEY is set. The structural/CRUD portion always runs.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { bootstrapAdmin, cleanupTestDb } from '../helpers/testDb.js';

const ROOT_EMAIL = process.env.ROOT_EMAIL;
const ROOT_PASSWORD = process.env.ROOT_PASSWORD;
const HAS_OPENAI = !!process.env.OPENAI_API_KEY;

let db;
beforeAll(async () => {
  await cleanupTestDb();
  db = await bootstrapAdmin();
}, 30000);

const { default: app } = await import('../../src/app.js');

afterAll(async () => {
  await cleanupTestDb();
}, 15000);

describe('BOM matching workflow — embed, find similar, auto-match, audit log', () => {
  let tenantCookies;
  let tenantSchema;
  let vendorId;
  let catalogSkuId;
  let vendorSkuId;

  test('1. Provision tenant and create vendor', async () => {
    const rootCookies = (
      await request(app).post('/api/auth/login').send({ email: ROOT_EMAIL, password: ROOT_PASSWORD })
    ).headers['set-cookie'];

    const res = await request(app)
      .post('/api/tenants/v1/tenants')
      .set('Cookie', rootCookies)
      .send({
        tenant_code: 'BMTEST',
        company: 'BOM Match Corp',
        status: 'active',
        tier: 'starter',
        admin_first_name: 'Test',
        admin_last_name: 'Admin',
        admin_email: 'admin@bmtest.com',
        admin_password: 'BmtestPass123!',
      });
    expect(res.status).toBe(201);

    const tenant = await db.one("SELECT schema_name FROM admin.tenants WHERE tenant_code = 'BMTEST'");
    tenantSchema = tenant.schema_name;

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@bmtest.com', password: 'BmtestPass123!' });
    tenantCookies = loginRes.headers['set-cookie'];
    expect(tenantCookies).toBeDefined();

    const vendorRes = await request(app)
      .post('/api/core/v1/vendors')
      .set('Cookie', tenantCookies)
      .send({ name: 'Lumber Yard Inc', code: 'LY01' });
    expect(vendorRes.status).toBe(201);
    vendorId = vendorRes.body.id;
  }, 30000);

  test('2. Create catalog SKU with normalized description', async () => {
    const res = await request(app)
      .post('/api/bom/v1/catalog-skus')
      .set('Cookie', tenantCookies)
      .send({
        catalog_sku: 'CAT-2X4-8',
        description: '2x4 Lumber SPF 8ft Grade #2',
        category: 'lumber',
        sub_category: 'dimensional',
      });
    expect(res.status).toBe(201);
    expect(res.body.description_normalized).toBeTruthy();
    catalogSkuId = res.body.id;

    // Verify in DB
    const row = await db.one(`SELECT catalog_sku, category FROM ${tenantSchema}.catalog_skus WHERE id = $1`, [catalogSkuId]);
    expect(row.catalog_sku).toBe('CAT-2X4-8');
    expect(row.category).toBe('lumber');
  });

  test('3. Create vendor SKU with normalized description', async () => {
    const res = await request(app)
      .post('/api/bom/v1/vendor-skus')
      .set('Cookie', tenantCookies)
      .send({
        vendor_id: vendorId,
        vendor_sku: 'LY-2X4-SPF',
        description: '2"x4" Spruce-Pine-Fir 8 foot Stud #2',
      });
    expect(res.status).toBe(201);
    expect(res.body.description_normalized).toBeTruthy();
    vendorSkuId = res.body.id;
  });

  test('4. Vendor SKU is listed as unmatched', async () => {
    const res = await request(app)
      .get('/api/bom/v1/vendor-skus/unmatched')
      .set('Cookie', tenantCookies);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    const unmatched = res.body.data.find((r) => r.id === vendorSkuId);
    expect(unmatched).toBeDefined();
    expect(unmatched.catalog_sku_id).toBeNull();
  });

  test('5. Create vendor pricing for vendor SKU', async () => {
    const res = await request(app)
      .post('/api/bom/v1/vendor-pricing')
      .set('Cookie', tenantCookies)
      .send({
        vendor_sku_id: vendorSkuId,
        unit_price: 4.25,
        unit: 'each',
        effective_date: '2025-06-01',
      });
    expect(res.status).toBe(201);
    expect(res.body.vendor_sku_id).toBe(vendorSkuId);
  });

  // --- Embedding & matching tests (require OpenAI key) ---

  test.skipIf(!HAS_OPENAI)('6. Refresh catalog embeddings', async () => {
    const res = await request(app)
      .post('/api/bom/v1/catalog-skus/refresh-embeddings')
      .set('Cookie', tenantCookies)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.refreshed).toBeGreaterThanOrEqual(1);

    // Verify embedding exists in DB
    const row = await db.one(`SELECT embedding IS NOT NULL AS has_embedding FROM ${tenantSchema}.catalog_skus WHERE id = $1`, [catalogSkuId]);
    expect(row.has_embedding).toBe(true);
  }, 30000);

  test.skipIf(!HAS_OPENAI)('7. Refresh vendor embeddings', async () => {
    const res = await request(app)
      .post('/api/bom/v1/vendor-skus/refresh-embeddings')
      .set('Cookie', tenantCookies)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.refreshed).toBeGreaterThanOrEqual(1);

    const row = await db.one(`SELECT embedding IS NOT NULL AS has_embedding FROM ${tenantSchema}.vendor_skus WHERE id = $1`, [vendorSkuId]);
    expect(row.has_embedding).toBe(true);
  }, 30000);

  test.skipIf(!HAS_OPENAI)('8. Find similar catalog SKUs', async () => {
    const res = await request(app)
      .post('/api/bom/v1/vendor-skus/match')
      .set('Cookie', tenantCookies)
      .send({ vendor_sku_id: vendorSkuId, top_k: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0]).toHaveProperty('similarity');
    expect(res.body.data[0].catalog_sku_id).toBe(catalogSkuId);
  }, 30000);

  test.skipIf(!HAS_OPENAI)('9. Auto-match vendor SKU to catalog SKU', async () => {
    const res = await request(app)
      .post('/api/bom/v1/vendor-skus/auto-match')
      .set('Cookie', tenantCookies)
      .send({ vendor_sku_id: vendorSkuId });
    expect(res.status).toBe(200);

    // If matched, verify DB update
    if (res.body.matched) {
      const row = await db.one(`SELECT catalog_sku_id, confidence FROM ${tenantSchema}.vendor_skus WHERE id = $1`, [vendorSkuId]);
      expect(row.catalog_sku_id).toBe(catalogSkuId);
      expect(parseFloat(row.confidence)).toBeGreaterThan(0);
    }
  }, 30000);

  test.skipIf(!HAS_OPENAI)('10. Verify match_review_logs audit entry', async () => {
    const logs = await db.manyOrNone(
      `SELECT entity_type, entity_id, match_type, decision
       FROM admin.match_review_logs
       WHERE entity_id = $1
       ORDER BY created_at DESC`,
      [vendorSkuId],
    );
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].entity_type).toBe('vendor_sku');
    expect(logs[0].match_type).toBe('auto');
    expect(['accept', 'defer']).toContain(logs[0].decision);
  });

  test.skipIf(!HAS_OPENAI)('11. Match review logs accessible via API', async () => {
    const rootCookies = (
      await request(app).post('/api/auth/login').send({ email: ROOT_EMAIL, password: ROOT_PASSWORD })
    ).headers['set-cookie'];

    const res = await request(app)
      .get('/api/tenants/v1/match-review-logs')
      .set('Cookie', rootCookies);
    expect(res.status).toBe(200);
  });
});
