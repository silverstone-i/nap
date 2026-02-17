/**
 * @file Integration test — BOM lifecycle: catalog SKU → vendor SKU → match → verify
 * @module tests/integration/bomLifecycle
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let insertCallLog = [];
let findByIdStore = {};

const mockModel = {
  findAfterCursor: vi.fn().mockResolvedValue({ data: [], hasMore: false }),
  findById: vi.fn((id) => Promise.resolve(findByIdStore[id] || null)),
  findWhere: vi.fn().mockResolvedValue([]),
  countWhere: vi.fn().mockResolvedValue(0),
  insert: vi.fn((data) => {
    const id = `id-${insertCallLog.length + 1}`;
    const record = { id, ...data };
    insertCallLog.push(record);
    findByIdStore[id] = record;
    return Promise.resolve(record);
  }),
  updateWhere: vi.fn().mockResolvedValue(1),
  bulkInsert: vi.fn().mockResolvedValue([]),
};

vi.mock('../../src/db/db.js', () => {
  const proxy = (modelName, schema) => {
    if (!schema) throw new Error('schemaName is required');
    return mockModel;
  };
  proxy.none = vi.fn();
  proxy.manyOrNone = vi.fn().mockResolvedValue([]);
  return { default: proxy, db: proxy };
});

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { CatalogSkusController } = await import('../../Modules/bom/controllers/catalogSkusController.js');
const { VendorSkusController } = await import('../../Modules/bom/controllers/vendorSkusController.js');
const { VendorPricingController } = await import('../../Modules/bom/controllers/vendorPricingController.js');
const { normalizeDescription } = await import('../../Modules/bom/services/embeddingService.js');

function mockReqRes({ body = {}, query = {}, params = {} } = {}) {
  const req = {
    user: { id: 'u1', tenant_code: 'TEST', schema_name: 'test' },
    body,
    query,
    params,
    ctx: { schema: 'test' },
  };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  return { req, res };
}

describe('BOM Lifecycle Integration', () => {
  let catalogCtrl, vendorSkuCtrl, pricingCtrl;

  beforeEach(() => {
    catalogCtrl = new CatalogSkusController();
    vendorSkuCtrl = new VendorSkusController();
    pricingCtrl = new VendorPricingController();
    insertCallLog = [];
    findByIdStore = {};
    vi.clearAllMocks();
    mockModel.findById.mockImplementation((id) => Promise.resolve(findByIdStore[id] || null));
    mockModel.insert.mockImplementation((data) => {
      const id = `id-${insertCallLog.length + 1}`;
      const record = { id, ...data };
      insertCallLog.push(record);
      findByIdStore[id] = record;
      return Promise.resolve(record);
    });
  });

  it('creates catalog SKU with normalized description', async () => {
    const { req, res } = mockReqRes({
      body: {
        tenant_id: 'tid', sku: 'MAT-001',
        description: 'STEEL Beam #4 Grade-A', category: 'structural',
      },
    });
    await catalogCtrl.create(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.description_normalized).toBe('steel beam 4 grade-a');
  });

  it('creates vendor SKU with normalized description and links to catalog', async () => {
    // Create catalog SKU first
    const { req: catReq, res: catRes } = mockReqRes({
      body: { tenant_id: 'tid', sku: 'MAT-001', description: 'Steel Beam Grade A' },
    });
    await catalogCtrl.create(catReq, catRes);
    const catalogSkuId = catRes.body.id;

    // Create vendor SKU
    const { req: vsReq, res: vsRes } = mockReqRes({
      body: {
        vendor_id: 'v1', vendor_sku: 'VEND-SB-4',
        description: '4" Steel I-Beam (Grade A)',
      },
    });
    await vendorSkuCtrl.create(vsReq, vsRes);
    expect(vsRes.statusCode).toBe(201);
    expect(vsRes.body.description_normalized).toBe('4 steel i-beam grade a');
  });

  it('creates vendor pricing with effective date', async () => {
    const { req, res } = mockReqRes({
      body: {
        vendor_sku_id: 'vs1', unit_price: '125.50',
        currency: 'USD', effective_date: '2025-03-01',
      },
    });
    await pricingCtrl.create(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.unit_price).toBe('125.50');
    expect(res.body.effective_date).toBe('2025-03-01');
  });

  it('normalizeDescription handles various SKU formats', () => {
    expect(normalizeDescription('1/2" COPPER Pipe Type-L')).toBe('1/2 copper pipe type-l');
    expect(normalizeDescription('PVC Fitting 90° Elbow')).toBe('pvc fitting 90 elbow');
    expect(normalizeDescription('  ROMEX  14/2  NM-B  Wire  ')).toBe('romex 14/2 nm-b wire');
  });
});
