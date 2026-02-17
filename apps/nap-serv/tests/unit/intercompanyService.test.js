/**
 * @file Unit tests for intercompany service — paired journal entries, module validation
 * @module tests/unit/intercompanyService
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOne = vi.fn();
const mockNone = vi.fn();
const mockTx = vi.fn();

vi.mock('../../src/db/db.js', () => {
  const proxy = () => ({});
  proxy.tx = (fn) => mockTx(fn);
  proxy.none = mockNone;
  proxy.one = mockOne;
  return { default: proxy, db: proxy };
});

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { createIntercompanyTransaction, VALID_MODULES } = await import(
  '../../Modules/accounting/services/intercompanyService.js'
);

describe('Intercompany Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default tx: run fn with mock transaction, plus inner createJournalEntry stubs
    mockTx.mockImplementation(async (fn) => {
      const t = {
        one: mockOne,
        none: mockNone,
        manyOrNone: vi.fn().mockResolvedValue([]),
        oneOrNone: vi.fn(),
      };
      return fn(t);
    });
    mockOne.mockResolvedValue({ id: 'entry-ic' });
    mockNone.mockResolvedValue();
  });

  it('exports valid modules', () => {
    expect(VALID_MODULES).toEqual(['ar', 'ap', 'je']);
  });

  it('rejects invalid module', async () => {
    await expect(createIntercompanyTransaction('test', {
      tenant_id: 't1', source_company_id: 'c1', target_company_id: 'c2',
      module: 'hr', amount: '1000',
      sourceAccountId: 'a1', targetAccountId: 'a2', intercompanyAccountId: 'a3',
    })).rejects.toThrow('Invalid module');
  });

  it('rejects zero or negative amount', async () => {
    await expect(createIntercompanyTransaction('test', {
      tenant_id: 't1', source_company_id: 'c1', target_company_id: 'c2',
      module: 'ap', amount: '0',
      sourceAccountId: 'a1', targetAccountId: 'a2', intercompanyAccountId: 'a3',
    })).rejects.toThrow('must be positive');
  });

  it('rejects negative amount', async () => {
    await expect(createIntercompanyTransaction('test', {
      tenant_id: 't1', source_company_id: 'c1', target_company_id: 'c2',
      module: 'ar', amount: '-500',
      sourceAccountId: 'a1', targetAccountId: 'a2', intercompanyAccountId: 'a3',
    })).rejects.toThrow('must be positive');
  });

  it('creates paired journal entries for valid transaction', async () => {
    // The createIntercompanyTransaction calls createJournalEntry twice (source + target)
    // then inserts the IC transaction record
    const result = await createIntercompanyTransaction('test', {
      tenant_id: 't1', source_company_id: 'c1', target_company_id: 'c2',
      module: 'je', amount: '5000', description: 'Test IC transfer',
      sourceAccountId: 'a-source', targetAccountId: 'a-target', intercompanyAccountId: 'a-ic',
    });

    // The outer db.tx calls t.one for the IC transaction record INSERT
    expect(mockOne).toHaveBeenCalled();
    expect(result.id).toBeDefined();
  });
});
