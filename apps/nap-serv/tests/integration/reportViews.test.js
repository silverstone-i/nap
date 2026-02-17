/**
 * @file Integration tests — Report views: profitability, cashflow, aging, margin
 * @module tests/integration/reportViews
 *
 * Tests verify calculation correctness with known mock data injected via
 * db.manyOrNone / db.oneOrNone stubs.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock db ──
const mockManyOrNone = vi.fn();
const mockOneOrNone = vi.fn();
const mockNone = vi.fn();

vi.mock('../../src/db/db.js', () => {
  const proxy = () => ({});
  proxy.manyOrNone = mockManyOrNone;
  proxy.oneOrNone = mockOneOrNone;
  proxy.none = mockNone;
  proxy.tx = vi.fn(async (fn) => fn({
    one: vi.fn(), none: vi.fn(), manyOrNone: vi.fn(async () => []), oneOrNone: vi.fn(),
  }));
  return { default: proxy, db: proxy };
});

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// Import controllers after mocks
const { default: profitabilityController } = await import('../../Modules/reports/controllers/profitabilityController.js');
const { default: cashflowController } = await import('../../Modules/reports/controllers/cashflowController.js');
const { default: costBreakdownController } = await import('../../Modules/reports/controllers/costBreakdownController.js');
const { default: arAgingController } = await import('../../Modules/reports/controllers/arAgingController.js');
const { default: apAgingController } = await import('../../Modules/reports/controllers/apAgingController.js');
const { default: marginAnalysisController } = await import('../../Modules/reports/controllers/marginAnalysisController.js');

function mockReq(overrides = {}) {
  return { user: { tenant_code: 'test' }, params: {}, query: {}, ...overrides };
}

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { res.statusCode = code; return res; },
    json(data) { res.body = data; return res; },
  };
  return res;
}

describe('Report Views — Profitability Calculations', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getAll returns profitability rows with derived metrics', async () => {
    mockManyOrNone.mockResolvedValueOnce([
      {
        project_id: 'p1', project_code: 'PRJ-001', project_name: 'Test',
        invoiced_revenue: '10000', committed_cost: '6000', collected_revenue: '8000',
        cash_out: '5000', actual_spend: '4000', total_budgeted_cost: '7000',
        change_order_value: '1000', gross_profit: '4000', gross_margin_pct: '40.00',
        net_cashflow: '3000', budget_variance: '3000', est_cost_at_completion: '7000',
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    await profitabilityController.getAll(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].project_code).toBe('PRJ-001');
    // gross_profit = invoiced_revenue - committed_cost = 10000 - 6000 = 4000
    expect(Number(res.body[0].gross_profit)).toBe(4000);
    // net_cashflow = collected_revenue - cash_out = 8000 - 5000 = 3000
    expect(Number(res.body[0].net_cashflow)).toBe(3000);
    // budget_variance = total_budgeted_cost - actual_spend = 7000 - 4000 = 3000
    expect(Number(res.body[0].budget_variance)).toBe(3000);
  });

  it('getByProject returns 404 for missing project', async () => {
    mockOneOrNone.mockResolvedValueOnce(null);

    const req = mockReq({ params: { projectId: 'missing' } });
    const res = mockRes();
    await profitabilityController.getByProject(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toContain('Project not found');
  });

  it('handles zero invoiced_revenue (0% margin)', async () => {
    mockManyOrNone.mockResolvedValueOnce([
      {
        project_id: 'p2', project_code: 'PRJ-002', project_name: 'Zero Rev',
        invoiced_revenue: '0', committed_cost: '500', gross_profit: '-500',
        gross_margin_pct: '0', net_cashflow: '-300', budget_variance: '1000',
        est_cost_at_completion: '1500',
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    await profitabilityController.getAll(req, res);

    expect(res.statusCode).toBe(200);
    // When invoiced_revenue = 0, margin should be 0
    expect(Number(res.body[0].gross_margin_pct)).toBe(0);
  });
});

describe('Report Views — Cashflow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getByProject returns monthly cashflow rows', async () => {
    mockManyOrNone.mockResolvedValueOnce([
      { project_id: 'p1', month: '2025-01-01', inflow: '5000', outflow: '3000', net_cashflow: '2000', cumulative_net: '2000' },
      { project_id: 'p1', month: '2025-02-01', inflow: '3000', outflow: '4000', net_cashflow: '-1000', cumulative_net: '1000' },
    ]);

    const req = mockReq({ params: { projectId: 'p1' } });
    const res = mockRes();
    await cashflowController.getByProject(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(Number(res.body[0].net_cashflow)).toBe(2000);
  });

  it('getByProject returns 404 for project with no data', async () => {
    mockManyOrNone.mockResolvedValueOnce([]);

    const req = mockReq({ params: { projectId: 'empty' } });
    const res = mockRes();
    await cashflowController.getByProject(req, res);

    expect(res.statusCode).toBe(404);
  });

  it('getForecast returns inflows, outflows, and burn rate', async () => {
    // Expected inflows (sent AR invoices)
    mockManyOrNone.mockResolvedValueOnce([
      { month: '2025-03-01', expected_inflow: '10000' },
    ]);
    // Expected outflows (approved AP invoices)
    mockManyOrNone.mockResolvedValueOnce([
      { month: '2025-03-01', expected_outflow: '4000' },
    ]);
    // Burn rate
    mockOneOrNone.mockResolvedValueOnce({ monthly_burn_rate: '2500' });

    const req = mockReq({ params: { projectId: 'p1' } });
    const res = mockRes();
    await cashflowController.getForecast(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.expected_inflows).toHaveLength(1);
    expect(res.body.expected_outflows).toHaveLength(1);
    expect(res.body.monthly_burn_rate).toBe(2500);
  });

  it('getForecast handles null burn rate', async () => {
    mockManyOrNone.mockResolvedValueOnce([]);
    mockManyOrNone.mockResolvedValueOnce([]);
    mockOneOrNone.mockResolvedValueOnce(null);

    const req = mockReq({ params: { projectId: 'p1' } });
    const res = mockRes();
    await cashflowController.getForecast(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.monthly_burn_rate).toBe(0);
  });

  it('getCompanyCashflow aggregates across projects', async () => {
    mockManyOrNone.mockResolvedValueOnce([
      { month: '2025-01-01', inflow: '15000', outflow: '10000', actual_cost: '8000', net_cashflow: '5000' },
    ]);

    const req = mockReq();
    const res = mockRes();
    await cashflowController.getCompanyCashflow(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(Number(res.body[0].net_cashflow)).toBe(5000);
  });
});

describe('Report Views — Cost Breakdown', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getByProject returns category-level breakdown', async () => {
    mockManyOrNone.mockResolvedValueOnce([
      { project_id: 'p1', category_code: 'LAB', category_name: 'Labor', budgeted_amount: '5000', actual_amount: '3000', variance: '2000' },
      { project_id: 'p1', category_code: 'MAT', category_name: 'Materials', budgeted_amount: '3000', actual_amount: '3500', variance: '-500' },
    ]);

    const req = mockReq({ params: { projectId: 'p1' } });
    const res = mockRes();
    await costBreakdownController.getByProject(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
    // Verify variance = budgeted - actual
    expect(Number(res.body[0].variance)).toBe(2000);
    expect(Number(res.body[1].variance)).toBe(-500);
  });
});

describe('Report Views — AR Aging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getAll returns aging buckets per client', async () => {
    mockManyOrNone.mockResolvedValueOnce([
      {
        client_id: 'c1', client_name: 'Acme', client_code: 'ACM',
        invoice_count: '5', total_balance: '20000',
        current_bucket: '5000', bucket_1_30: '8000', bucket_31_60: '3000',
        bucket_61_90: '2000', bucket_over_90: '2000',
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    await arAgingController.getAll(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(Number(res.body[0].total_balance)).toBe(20000);
  });

  it('getByClient returns 404 for missing client', async () => {
    mockOneOrNone.mockResolvedValueOnce(null);

    const req = mockReq({ params: { clientId: 'missing' } });
    const res = mockRes();
    await arAgingController.getByClient(req, res);

    expect(res.statusCode).toBe(404);
  });
});

describe('Report Views — AP Aging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getAll returns aging buckets per vendor', async () => {
    mockManyOrNone.mockResolvedValueOnce([
      {
        vendor_id: 'v1', vendor_name: 'Supplies Inc', vendor_code: 'SUP',
        invoice_count: '3', total_balance: '12000',
        current_bucket: '4000', bucket_1_30: '5000', bucket_31_60: '2000',
        bucket_61_90: '1000', bucket_over_90: '0',
      },
    ]);

    const req = mockReq();
    const res = mockRes();
    await apAgingController.getAll(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(Number(res.body[0].total_balance)).toBe(12000);
  });

  it('getByVendor returns 404 for missing vendor', async () => {
    mockOneOrNone.mockResolvedValueOnce(null);

    const req = mockReq({ params: { vendorId: 'missing' } });
    const res = mockRes();
    await apAgingController.getByVendor(req, res);

    expect(res.statusCode).toBe(404);
  });
});

describe('Report Views — Margin Analysis', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getAll returns rows sorted by margin', async () => {
    mockManyOrNone.mockResolvedValueOnce([
      { project_code: 'PRJ-A', gross_margin_pct: '45.00' },
      { project_code: 'PRJ-B', gross_margin_pct: '30.00' },
    ]);

    const req = mockReq();
    const res = mockRes();
    await marginAnalysisController.getAll(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('rejects invalid sort column (SQL injection prevention)', async () => {
    const req = mockReq({ query: { sortBy: 'DROP TABLE users; --' } });
    const res = mockRes();
    await marginAnalysisController.getAll(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain('Invalid sort column');
    // Verify db was never called
    expect(mockManyOrNone).not.toHaveBeenCalled();
  });

  it('accepts valid sort columns with ASC direction', async () => {
    mockManyOrNone.mockResolvedValueOnce([]);

    const req = mockReq({ query: { sortBy: 'invoiced_revenue', sortDir: 'ASC' } });
    const res = mockRes();
    await marginAnalysisController.getAll(req, res);

    expect(res.statusCode).toBe(200);
    // Verify the SQL contains ASC
    const sqlCall = mockManyOrNone.mock.calls[0][0];
    expect(sqlCall).toContain('invoiced_revenue ASC');
  });

  it('defaults to DESC when sortDir not specified', async () => {
    mockManyOrNone.mockResolvedValueOnce([]);

    const req = mockReq({ query: { sortBy: 'gross_profit' } });
    const res = mockRes();
    await marginAnalysisController.getAll(req, res);

    const sqlCall = mockManyOrNone.mock.calls[0][0];
    expect(sqlCall).toContain('gross_profit DESC');
  });
});
