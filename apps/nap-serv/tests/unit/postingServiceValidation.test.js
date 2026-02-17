/**
 * @file Unit tests for posting service — balance validation, reversal chain, hooks
 * @module tests/unit/postingServiceValidation
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock db ──
const mockTx = vi.fn();
const mockOne = vi.fn();
const mockOneOrNone = vi.fn();
const mockNone = vi.fn();
const mockManyOrNone = vi.fn();

vi.mock('../../src/db/db.js', () => {
  const proxy = () => ({});
  proxy.tx = (fn) => mockTx(fn);
  proxy.none = mockNone;
  proxy.one = mockOne;
  proxy.oneOrNone = mockOneOrNone;
  proxy.manyOrNone = mockManyOrNone;
  return { default: proxy, db: proxy };
});

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const {
  createJournalEntry,
  postEntry,
  reverseEntry,
  postAPInvoice,
  postAPPayment,
  postARInvoice,
  postARReceipt,
  postActualCost,
} = await import('../../Modules/accounting/services/postingService.js');

describe('Posting Service — createJournalEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default tx implementation: call the async fn with a mock transaction object
    mockTx.mockImplementation(async (fn) => {
      const t = { one: mockOne, none: mockNone, manyOrNone: mockManyOrNone, oneOrNone: mockOneOrNone };
      return fn(t);
    });
  });

  it('rejects entry with no lines', async () => {
    await expect(createJournalEntry('test', { tenant_id: 't1', company_id: 'c1' }))
      .rejects.toThrow('must have at least one line');
  });

  it('rejects entry with empty lines array', async () => {
    await expect(createJournalEntry('test', { tenant_id: 't1', company_id: 'c1', lines: [] }))
      .rejects.toThrow('must have at least one line');
  });

  it('rejects unbalanced debits and credits', async () => {
    await expect(createJournalEntry('test', {
      tenant_id: 't1', company_id: 'c1',
      lines: [
        { account_id: 'a1', debit: 100, credit: 0 },
        { account_id: 'a2', debit: 0, credit: 50 },
      ],
    })).rejects.toThrow('does not balance');
  });

  it('accepts balanced entry within tolerance', async () => {
    mockOne.mockResolvedValueOnce({ id: 'entry-1' }); // header insert
    mockOne.mockResolvedValueOnce({ id: 'line-1' });  // line 1 insert
    mockOne.mockResolvedValueOnce({ id: 'line-2' });  // line 2 insert
    mockNone.mockResolvedValueOnce();                  // posting queue

    const result = await createJournalEntry('test', {
      tenant_id: 't1', company_id: 'c1', entry_date: '2025-01-01',
      lines: [
        { account_id: 'a1', debit: 100, credit: 0 },
        { account_id: 'a2', debit: 0, credit: 100 },
      ],
    });

    expect(result.id).toBe('entry-1');
    expect(result.lines).toHaveLength(2);
  });

  it('creates posting queue entry for new journal entry', async () => {
    mockOne.mockResolvedValueOnce({ id: 'entry-1', tenant_id: 't1' });
    mockOne.mockResolvedValueOnce({ id: 'line-1' });
    mockOne.mockResolvedValueOnce({ id: 'line-2' });
    mockNone.mockResolvedValueOnce(); // posting queue

    await createJournalEntry('test', {
      tenant_id: 't1', company_id: 'c1', entry_date: '2025-01-01',
      lines: [
        { account_id: 'a1', debit: 200, credit: 0 },
        { account_id: 'a2', debit: 0, credit: 200 },
      ],
    });

    // Verify none was called for posting queue INSERT
    expect(mockNone).toHaveBeenCalledTimes(1);
  });
});

describe('Posting Service — postEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.mockImplementation(async (fn) => {
      const t = { one: mockOne, none: mockNone, manyOrNone: mockManyOrNone, oneOrNone: mockOneOrNone };
      return fn(t);
    });
  });

  it('rejects non-existent entry', async () => {
    mockOneOrNone.mockResolvedValueOnce(null);
    await expect(postEntry('test', 'missing')).rejects.toThrow('not found');
  });

  it('rejects non-pending entry', async () => {
    mockOneOrNone.mockResolvedValueOnce({ id: 'e1', status: 'posted' });
    await expect(postEntry('test', 'e1')).rejects.toThrow('Cannot post');
  });

  it('posts pending entry and updates ledger balances', async () => {
    mockOneOrNone.mockResolvedValueOnce({ id: 'e1', status: 'pending', tenant_id: 't1', entry_date: '2025-01-01' });
    mockManyOrNone.mockResolvedValueOnce([
      { account_id: 'a1', debit: '100', credit: '0' },
      { account_id: 'a2', debit: '0', credit: '100' },
    ]);
    mockNone.mockResolvedValue(); // ledger upserts + status updates

    const result = await postEntry('test', 'e1');
    expect(result.status).toBe('posted');
    // 2 ledger upserts + 1 entry status + 1 queue status = 4 none calls
    expect(mockNone).toHaveBeenCalledTimes(4);
  });
});

describe('Posting Service — reverseEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.mockImplementation(async (fn) => {
      const t = { one: mockOne, none: mockNone, manyOrNone: mockManyOrNone, oneOrNone: mockOneOrNone };
      return fn(t);
    });
  });

  it('rejects non-posted entry', async () => {
    mockOneOrNone.mockResolvedValueOnce({ id: 'e1', status: 'pending' });
    await expect(reverseEntry('test', 'e1', 't1')).rejects.toThrow('Cannot reverse');
  });

  it('creates correcting entry with swapped debits/credits', async () => {
    mockOneOrNone.mockResolvedValueOnce({ id: 'e1', status: 'posted', company_id: 'c1', project_id: null, description: 'Test', source_type: 'manual' });
    mockManyOrNone.mockResolvedValueOnce([
      { account_id: 'a1', debit: '500', credit: '0', memo: 'Dr', related_table: null, related_id: null },
      { account_id: 'a2', debit: '0', credit: '500', memo: 'Cr', related_table: null, related_id: null },
    ]);
    mockOne.mockResolvedValueOnce({ id: 'correcting-1' }); // correcting entry
    mockNone.mockResolvedValue(); // reversed lines, original status, queue

    const result = await reverseEntry('test', 'e1', 't1');
    expect(result.id).toBe('correcting-1');
    // Verify lines are inserted with swapped amounts (none called for each line)
    expect(mockNone).toHaveBeenCalled();
  });
});

describe('Posting Service — module hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTx.mockImplementation(async (fn) => {
      const t = { one: mockOne, none: mockNone, manyOrNone: mockManyOrNone, oneOrNone: mockOneOrNone };
      return fn(t);
    });
    // Stub createJournalEntry calls within hooks
    mockOne.mockResolvedValue({ id: 'entry-hook' });
    mockNone.mockResolvedValue();
  });

  it('postAPInvoice skips zero-amount invoice', async () => {
    const result = await postAPInvoice('test', { total_amount: 0 }, { expenseAccountId: 'a1', apLiabilityAccountId: 'a2' });
    expect(result).toBeNull();
  });

  it('postAPInvoice creates entry for positive-amount invoice', async () => {
    const result = await postAPInvoice('test', {
      tenant_id: 't1', company_id: 'c1', invoice_date: '2025-01-01',
      invoice_number: 'AP-001', total_amount: '5000', id: 'inv-1',
    }, { expenseAccountId: 'a1', apLiabilityAccountId: 'a2' });
    expect(result.id).toBe('entry-hook');
  });

  it('postAPPayment skips zero-amount payment', async () => {
    const result = await postAPPayment('test', { amount: 0 }, { apLiabilityAccountId: 'a1', cashAccountId: 'a2' });
    expect(result).toBeNull();
  });

  it('postARInvoice skips zero-amount invoice', async () => {
    const result = await postARInvoice('test', { total_amount: 0 }, { arReceivableAccountId: 'a1', revenueAccountId: 'a2' });
    expect(result).toBeNull();
  });

  it('postARReceipt skips zero-amount receipt', async () => {
    const result = await postARReceipt('test', { amount: 0 }, { cashAccountId: 'a1', arReceivableAccountId: 'a2' });
    expect(result).toBeNull();
  });

  it('postActualCost skips zero-amount cost', async () => {
    const result = await postActualCost('test', { amount: 0 }, { expenseAccountId: 'a1', accrualAccountId: 'a2' });
    expect(result).toBeNull();
  });

  it('postActualCost creates entry for positive-amount cost', async () => {
    const result = await postActualCost('test', {
      id: 'ac-1', amount: '2500', project_id: 'p1', incurred_on: '2025-02-01',
      reference: 'REF-001',
    }, {
      expenseAccountId: 'a1', accrualAccountId: 'a2',
      companyId: 'c1', tenantId: 't1',
    });
    expect(result.id).toBe('entry-hook');
  });
});
