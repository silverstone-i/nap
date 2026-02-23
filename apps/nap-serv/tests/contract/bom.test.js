/**
 * @file Contract tests for BOM module endpoints
 * @module tests/contract/bom
 *
 * Tests the BOM API: catalog-skus, vendor-skus, vendor-pricing CRUD,
 * plus match-review-logs read-only endpoint.
 * Requires a provisioned tenant schema with a vendor entity.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
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

async function provisionTenant(cookies) {
  const res = await request(app)
    .post('/api/tenants/v1/tenants')
    .set('Cookie', cookies)
    .send({
      tenant_code: 'BTEST',
      company: 'BOM Test Corp',
      status: 'active',
      tier: 'starter',
      admin_email: 'admin@btest.com',
      admin_password: 'BtestPass123!',
    });
  return res.body;
}

async function loginTenant(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return res.headers['set-cookie'];
}

describe('BOM Module — /api/bom/v1', () => {
  let cookies;
  let tenantCookies;
  let vendorId;

  beforeAll(async () => {
    cookies = await loginRoot();
    await provisionTenant(cookies);

    tenantCookies = await loginTenant('admin@btest.com', 'BtestPass123!');

    // Create a vendor for vendor_skus FK
    const vendorRes = await request(app)
      .post('/api/core/v1/vendors')
      .set('Cookie', tenantCookies)
      .send({ name: 'Test Vendor', code: 'TV01' });
    vendorId = vendorRes.body.id;
  }, 30000);

  /* ---- Catalog SKUs ---- */

  describe('Catalog SKUs — /api/bom/v1/catalog-skus', () => {
    let catalogSkuId;

    test('requires authentication', async () => {
      const res = await request(app).get('/api/bom/v1/catalog-skus');
      expect(res.status).toBe(401);
    });

    test('creates a catalog SKU', async () => {
      const res = await request(app)
        .post('/api/bom/v1/catalog-skus')
        .set('Cookie', tenantCookies)
        .send({
          catalog_sku: 'CAT-001',
          description: '2x4 Lumber SPF 8ft',
          category: 'lumber',
          sub_category: 'dimensional',
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.catalog_sku).toBe('CAT-001');
      expect(res.body.description_normalized).toBeTruthy();
      catalogSkuId = res.body.id;
    });

    test('lists catalog SKUs', async () => {
      const res = await request(app).get('/api/bom/v1/catalog-skus').set('Cookie', tenantCookies);
      expect(res.status).toBe(200);
      expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
    });

    test('gets catalog SKU by id', async () => {
      const res = await request(app).get(`/api/bom/v1/catalog-skus/${catalogSkuId}`).set('Cookie', tenantCookies);
      expect(res.status).toBe(200);
      expect(res.body.catalog_sku).toBe('CAT-001');
    });

    test('updates a catalog SKU', async () => {
      const res = await request(app)
        .put(`/api/bom/v1/catalog-skus/update?id=${catalogSkuId}`)
        .set('Cookie', tenantCookies)
        .send({ description: '2x4 Lumber SPF 10ft' });
      expect(res.status).toBe(200);
    });

    test('archives and restores a catalog SKU', async () => {
      const archiveRes = await request(app)
        .delete(`/api/bom/v1/catalog-skus/archive?id=${catalogSkuId}`)
        .set('Cookie', tenantCookies)
        .send({});
      expect(archiveRes.status).toBe(200);

      const restoreRes = await request(app)
        .patch(`/api/bom/v1/catalog-skus/restore?id=${catalogSkuId}`)
        .set('Cookie', tenantCookies)
        .send({});
      expect(restoreRes.status).toBe(200);
    });
  });

  /* ---- Vendor SKUs ---- */

  describe('Vendor SKUs — /api/bom/v1/vendor-skus', () => {
    let vendorSkuId;

    test('creates a vendor SKU', async () => {
      const res = await request(app)
        .post('/api/bom/v1/vendor-skus')
        .set('Cookie', tenantCookies)
        .send({
          vendor_id: vendorId,
          vendor_sku: 'VS-001',
          description: '2x4 SPF Stud 8ft Grade #2',
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.vendor_sku).toBe('VS-001');
      expect(res.body.description_normalized).toBeTruthy();
      vendorSkuId = res.body.id;
    });

    test('lists vendor SKUs', async () => {
      const res = await request(app).get('/api/bom/v1/vendor-skus').set('Cookie', tenantCookies);
      expect(res.status).toBe(200);
      expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
    });

    test('gets unmatched vendor SKUs', async () => {
      const res = await request(app).get('/api/bom/v1/vendor-skus/unmatched').set('Cookie', tenantCookies);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].catalog_sku_id).toBeNull();
    });

    test('archives and restores a vendor SKU', async () => {
      const archiveRes = await request(app)
        .delete(`/api/bom/v1/vendor-skus/archive?id=${vendorSkuId}`)
        .set('Cookie', tenantCookies)
        .send({});
      expect(archiveRes.status).toBe(200);

      const restoreRes = await request(app)
        .patch(`/api/bom/v1/vendor-skus/restore?id=${vendorSkuId}`)
        .set('Cookie', tenantCookies)
        .send({});
      expect(restoreRes.status).toBe(200);
    });
  });

  /* ---- Vendor Pricing ---- */

  describe('Vendor Pricing — /api/bom/v1/vendor-pricing', () => {
    let vendorSkuId;
    let pricingId;

    beforeAll(async () => {
      const skuRes = await request(app)
        .post('/api/bom/v1/vendor-skus')
        .set('Cookie', tenantCookies)
        .send({
          vendor_id: vendorId,
          vendor_sku: 'VS-PRICE-01',
          description: 'Pricing test SKU',
        });
      vendorSkuId = skuRes.body.id;
    });

    test('creates a pricing record', async () => {
      const res = await request(app)
        .post('/api/bom/v1/vendor-pricing')
        .set('Cookie', tenantCookies)
        .send({
          vendor_sku_id: vendorSkuId,
          unit_price: 12.5,
          unit: 'each',
          effective_date: '2025-01-01',
        });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      pricingId = res.body.id;
    });

    test('lists pricing records', async () => {
      const res = await request(app).get('/api/bom/v1/vendor-pricing').set('Cookie', tenantCookies);
      expect(res.status).toBe(200);
      expect(res.body.rows.length).toBeGreaterThanOrEqual(1);
    });

    test('archives and restores a pricing record', async () => {
      const archiveRes = await request(app)
        .delete(`/api/bom/v1/vendor-pricing/archive?id=${pricingId}`)
        .set('Cookie', tenantCookies)
        .send({});
      expect(archiveRes.status).toBe(200);

      const restoreRes = await request(app)
        .patch(`/api/bom/v1/vendor-pricing/restore?id=${pricingId}`)
        .set('Cookie', tenantCookies)
        .send({});
      expect(restoreRes.status).toBe(200);
    });
  });

  /* ---- Match Review Logs ---- */

  describe('Match Review Logs — /api/tenants/v1/match-review-logs', () => {
    test('lists match review logs (may be empty)', async () => {
      const res = await request(app).get('/api/tenants/v1/match-review-logs').set('Cookie', cookies);
      expect(res.status).toBe(200);
    });
  });
});
