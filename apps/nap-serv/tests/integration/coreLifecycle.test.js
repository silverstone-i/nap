/**
 * @file Integration tests — Core entity lifecycle (source auto-creation)
 * @module tests/integration/coreLifecycle
 *
 * Verifies that creating a vendor, client, or employee auto-creates a
 * polymorphic sources record and links it back to the entity.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track inserts and updates across models
let insertCallLog = [];
let findByIdStore = {};

const mockModel = {
  findOneBy: vi.fn(async () => null),
  findById: vi.fn(async (id) => findByIdStore[id] ?? null),
  findAfterCursor: vi.fn(async () => ({ data: [], hasMore: false })),
  findWhere: vi.fn(async () => []),
  countWhere: vi.fn(async () => 0),
  insert: vi.fn(async (data) => {
    const record = { id: `id-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...data };
    insertCallLog.push(record);
    findByIdStore[record.id] = record;
    return record;
  }),
  updateWhere: vi.fn(async () => 1),
  bulkInsert: vi.fn(async (data) => data),
  setSchemaName: vi.fn(),
};

// Mock DB — tracks which model name is requested and provides tx support
vi.mock('../../src/db/db.js', () => {
  const dbProxy = (name, schema) => {
    mockModel._lastModelName = name;
    mockModel.setSchemaName(schema);
    return mockModel;
  };

  const modelNames = [
    'tenants', 'napUsers', 'roleMembers', 'policies',
    'sources', 'vendors', 'clients', 'employees', 'contacts', 'addresses', 'interCompanies',
  ];
  for (const name of modelNames) {
    dbProxy[name] = { setSchemaName: vi.fn().mockReturnValue(mockModel) };
  }
  dbProxy.none = vi.fn();
  dbProxy.tx = vi.fn(async (cb) => {
    const t = { none: vi.fn() };
    const result = await cb(t);
    // Capture the t.none calls for UPDATE assertions
    dbProxy._lastTx = t;
    return result;
  });
  return { default: dbProxy, db: dbProxy };
});

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

describe('Core Entity Lifecycle', () => {
  beforeEach(() => {
    insertCallLog = [];
    findByIdStore = {};
    vi.clearAllMocks();
  });

  describe('Vendor → source auto-creation', () => {
    it('creating a vendor auto-creates a source with source_type=vendor', async () => {
      const { VendorsController } = await import('../../src/modules/core/controllers/vendorsController.js');
      const ctrl = new VendorsController();

      const { req, res } = mockReqRes({
        body: { tenant_id: 'tid', name: 'Acme Lumber', code: 'ACM-001' },
      });

      await ctrl.create(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.source_id).toBeDefined();

      // Two inserts: vendor + source
      expect(insertCallLog).toHaveLength(2);

      const vendorInsert = insertCallLog[0];
      const sourceInsert = insertCallLog[1];

      expect(vendorInsert.name).toBe('Acme Lumber');
      expect(sourceInsert.source_type).toBe('vendor');
      expect(sourceInsert.table_id).toBe(vendorInsert.id);
      expect(sourceInsert.label).toBe('Acme Lumber');
    });

    it('links source back to vendor via UPDATE', async () => {
      const db = (await import('../../src/db/db.js')).default;
      const { VendorsController } = await import('../../src/modules/core/controllers/vendorsController.js');
      const ctrl = new VendorsController();

      const { req, res } = mockReqRes({
        body: { tenant_id: 'tid', name: 'Acme Lumber', code: 'ACM-001', created_by: null },
      });

      await ctrl.create(req, res);

      // db.tx was called and the transaction's none() was used for the UPDATE
      expect(db.tx).toHaveBeenCalled();
      expect(db._lastTx.none).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE'),
        expect.arrayContaining([res.body.source_id]),
      );
    });
  });

  describe('Client → source auto-creation', () => {
    it('creating a client auto-creates a source with source_type=client', async () => {
      const { ClientsController } = await import('../../src/modules/core/controllers/clientsController.js');
      const ctrl = new ClientsController();

      const { req, res } = mockReqRes({
        body: { tenant_id: 'tid', name: 'Big Builder Corp', code: 'BBC-001' },
      });

      await ctrl.create(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.body.source_id).toBeDefined();

      expect(insertCallLog).toHaveLength(2);

      const clientInsert = insertCallLog[0];
      const sourceInsert = insertCallLog[1];

      expect(clientInsert.name).toBe('Big Builder Corp');
      expect(sourceInsert.source_type).toBe('client');
      expect(sourceInsert.table_id).toBe(clientInsert.id);
      expect(sourceInsert.label).toBe('Big Builder Corp');
    });
  });

  describe('Employee → source auto-creation', () => {
    it('creating an employee auto-creates a source with source_type=employee', async () => {
      const { EmployeesController } = await import('../../src/modules/core/controllers/employeesController.js');
      const ctrl = new EmployeesController();

      const { req, res } = mockReqRes({
        body: { tenant_id: 'tid', first_name: 'John', last_name: 'Doe' },
      });

      await ctrl.create(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.body.source_id).toBeDefined();

      expect(insertCallLog).toHaveLength(2);

      const employeeInsert = insertCallLog[0];
      const sourceInsert = insertCallLog[1];

      expect(employeeInsert.first_name).toBe('John');
      expect(sourceInsert.source_type).toBe('employee');
      expect(sourceInsert.table_id).toBe(employeeInsert.id);
      expect(sourceInsert.label).toBe('John Doe');
    });
  });

  describe('Source record type correctness', () => {
    it('each entity type produces the correct source_type value', async () => {
      const { VendorsController } = await import('../../src/modules/core/controllers/vendorsController.js');
      const { ClientsController } = await import('../../src/modules/core/controllers/clientsController.js');
      const { EmployeesController } = await import('../../src/modules/core/controllers/employeesController.js');

      const cases = [
        { Ctrl: VendorsController, body: { tenant_id: 'tid', name: 'V1', code: 'V1' }, expectedType: 'vendor' },
        { Ctrl: ClientsController, body: { tenant_id: 'tid', name: 'C1', code: 'C1' }, expectedType: 'client' },
        { Ctrl: EmployeesController, body: { tenant_id: 'tid', first_name: 'E', last_name: '1' }, expectedType: 'employee' },
      ];

      for (const { Ctrl, body, expectedType } of cases) {
        insertCallLog = [];
        vi.clearAllMocks();

        const ctrl = new Ctrl();
        const { req, res } = mockReqRes({ body });
        await ctrl.create(req, res);

        const sourceInsert = insertCallLog.find((r) => r.source_type);
        expect(sourceInsert).toBeDefined();
        expect(sourceInsert.source_type).toBe(expectedType);
      }
    });
  });
});
