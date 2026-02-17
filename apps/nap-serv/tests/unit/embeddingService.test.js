/**
 * @file Unit tests for description normalization and embedding service
 * @module tests/unit/embeddingService
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock db before importing embeddingService
vi.mock('../../src/db/db.js', () => {
  const proxy = () => ({});
  proxy.none = vi.fn();
  return { default: proxy, db: proxy };
});

vi.mock('../../src/utils/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { normalizeDescription, generateEmbedding, batchGenerateEmbeddings, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } = await import(
  '../../Modules/bom/services/embeddingService.js'
);

describe('Embedding Service', () => {
  describe('normalizeDescription', () => {
    it('lowercases and strips special characters', () => {
      expect(normalizeDescription('STEEL Beam #4 (Grade-A)')).toBe('steel beam 4 grade-a');
    });

    it('collapses multiple spaces', () => {
      expect(normalizeDescription('  lumber   2x4   kiln   dried  ')).toBe('lumber 2x4 kiln dried');
    });

    it('preserves forward slashes and dots', () => {
      expect(normalizeDescription('3/4" plywood 4x8 ft.')).toBe('3/4 plywood 4x8 ft.');
    });

    it('returns empty string for null/undefined', () => {
      expect(normalizeDescription(null)).toBe('');
      expect(normalizeDescription(undefined)).toBe('');
    });

    it('handles empty string', () => {
      expect(normalizeDescription('')).toBe('');
    });
  });

  describe('constants', () => {
    it('uses text-embedding-3-large model', () => {
      expect(EMBEDDING_MODEL).toBe('text-embedding-3-large');
    });

    it('uses 3072 dimensions', () => {
      expect(EMBEDDING_DIMENSIONS).toBe(3072);
    });
  });

  describe('generateEmbedding', () => {
    const originalEnv = process.env.OPENAI_API_KEY;

    afterEach(() => {
      process.env.OPENAI_API_KEY = originalEnv;
      vi.restoreAllMocks();
    });

    it('throws if OPENAI_API_KEY is not set', async () => {
      delete process.env.OPENAI_API_KEY;
      await expect(generateEmbedding('test')).rejects.toThrow('OPENAI_API_KEY is not configured');
    });

    it('throws for empty text after normalization', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      await expect(generateEmbedding('')).rejects.toThrow('Cannot generate embedding for empty text');
    });

    it('calls OpenAI API and returns embedding', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const fakeEmbedding = Array.from({ length: 3072 }, (_, i) => i * 0.001);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: [{ embedding: fakeEmbedding }] }),
      });

      const result = await generateEmbedding('Steel Beam #4');
      expect(result).toEqual(fakeEmbedding);
      expect(result).toHaveLength(3072);

      // Verify the fetch call
      const [url, opts] = global.fetch.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/embeddings');
      const body = JSON.parse(opts.body);
      expect(body.model).toBe('text-embedding-3-large');
      expect(body.dimensions).toBe(3072);
      expect(body.input).toBe('steel beam 4');
    });

    it('throws on API error', async () => {
      process.env.OPENAI_API_KEY = 'test-key';

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limited'),
      });

      await expect(generateEmbedding('test')).rejects.toThrow('OpenAI API error (429)');
    });
  });

  describe('batchGenerateEmbeddings', () => {
    const originalEnv = process.env.OPENAI_API_KEY;

    afterEach(() => {
      process.env.OPENAI_API_KEY = originalEnv;
      vi.restoreAllMocks();
    });

    it('processes multiple texts in batch', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const fakeEmb1 = Array.from({ length: 3072 }, () => 0.1);
      const fakeEmb2 = Array.from({ length: 3072 }, () => 0.2);

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          data: [
            { index: 0, embedding: fakeEmb1 },
            { index: 1, embedding: fakeEmb2 },
          ],
        }),
      });

      const results = await batchGenerateEmbeddings(['Steel Beam', 'Copper Pipe']);
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual(fakeEmb1);
      expect(results[1]).toEqual(fakeEmb2);
    });
  });
});
