/**
 * @file Unit tests for SKU matching service logic
 * @module tests/unit/matchingService
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindById = vi.fn();
const mockManyOrNone = vi.fn();
const mockNone = vi.fn();
const mockInsert = vi.fn();

vi.mock('../../src/db/db.js', () => {
  const handler = {
    findById: (...args) => mockFindById(...args),
    findWhere: vi.fn(async () => []),
    insert: (...args) => mockInsert(...args),
  };
  const proxy = (modelName, schema) => handler;
  proxy.manyOrNone = (...args) => mockManyOrNone(...args);
  proxy.none = (...args) => mockNone(...args);
  return { default: proxy, db: proxy };
});

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { findSimilarCatalogSkus, autoMatch, batchMatch } = await import(
  '../../Modules/bom/services/matchingService.js'
);

describe('Matching Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInsert.mockResolvedValue({ id: 'log-1' });
  });

  describe('findSimilarCatalogSkus', () => {
    it('throws if vendor SKU not found', async () => {
      mockFindById.mockResolvedValueOnce(null);
      await expect(findSimilarCatalogSkus('test', 'missing-id')).rejects.toThrow('not found');
    });

    it('returns ranked results from pgvector query', async () => {
      mockFindById.mockResolvedValueOnce({ id: 'vs1', embedding: [0.1] });
      mockManyOrNone.mockResolvedValueOnce([
        { catalog_sku_id: 'cs1', sku: 'MAT-001', description: 'Steel Beam', similarity: '0.92' },
        { catalog_sku_id: 'cs2', sku: 'MAT-002', description: 'Iron Beam', similarity: '0.78' },
      ]);

      const results = await findSimilarCatalogSkus('test', 'vs1', 5);
      expect(results).toHaveLength(2);
      expect(results[0].similarity).toBe(0.92);
      expect(results[0].catalog_sku_id).toBe('cs1');
      expect(results[1].similarity).toBe(0.78);
    });
  });

  describe('autoMatch', () => {
    it('assigns catalog SKU when above threshold', async () => {
      mockFindById.mockResolvedValueOnce({ id: 'vs1', embedding: [0.1] });
      mockManyOrNone.mockResolvedValueOnce([
        { catalog_sku_id: 'cs1', sku: 'MAT-001', description: 'Steel Beam', similarity: '0.92' },
      ]);

      const result = await autoMatch('test', 'vs1', 0.85, 'user1');
      expect(result.matched).toBe(true);
      expect(result.catalog_sku_id).toBe('cs1');
      expect(result.confidence).toBe(0.92);

      // Should update vendor SKU
      expect(mockNone).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE test.vendor_skus SET catalog_sku_id'),
        ['cs1', 0.92, 'vs1'],
      );

      // Should log accept decision
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'accept', entity_type: 'vendor_sku' }),
      );
    });

    it('defers when below threshold', async () => {
      mockFindById.mockResolvedValueOnce({ id: 'vs1', embedding: [0.1] });
      mockManyOrNone.mockResolvedValueOnce([
        { catalog_sku_id: 'cs1', sku: 'MAT-001', description: 'Steel Beam', similarity: '0.60' },
      ]);

      const result = await autoMatch('test', 'vs1', 0.85, 'user1');
      expect(result.matched).toBe(false);
      expect(result.catalog_sku_id).toBeNull();
      expect(result.confidence).toBe(0.60);

      // Should log defer decision
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 'defer' }),
      );
    });

    it('defers when no matches found', async () => {
      mockFindById.mockResolvedValueOnce({ id: 'vs1', embedding: [0.1] });
      mockManyOrNone.mockResolvedValueOnce([]);

      const result = await autoMatch('test', 'vs1', 0.85);
      expect(result.matched).toBe(false);
      expect(result.confidence).toBeNull();
    });
  });

  describe('batchMatch', () => {
    it('processes multiple vendor SKUs and returns results', async () => {
      // First call: match succeeds
      mockFindById.mockResolvedValueOnce({ id: 'vs1', embedding: [0.1] });
      mockManyOrNone.mockResolvedValueOnce([
        { catalog_sku_id: 'cs1', sku: 'MAT-001', description: 'Steel', similarity: '0.90' },
      ]);

      // Second call: match fails (below threshold)
      mockFindById.mockResolvedValueOnce({ id: 'vs2', embedding: [0.2] });
      mockManyOrNone.mockResolvedValueOnce([
        { catalog_sku_id: 'cs2', sku: 'MAT-002', description: 'Wood', similarity: '0.50' },
      ]);

      const results = await batchMatch('test', ['vs1', 'vs2'], 0.85);
      expect(results).toHaveLength(2);
      expect(results[0].matched).toBe(true);
      expect(results[1].matched).toBe(false);
    });

    it('handles errors for individual SKUs gracefully', async () => {
      mockFindById.mockRejectedValueOnce(new Error('DB error'));

      const results = await batchMatch('test', ['bad-id'], 0.85);
      expect(results).toHaveLength(1);
      expect(results[0].matched).toBe(false);
      expect(results[0].error).toBe('DB error');
    });
  });
});
