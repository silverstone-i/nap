/**
 * @file Embedding service — generates vector embeddings for SKU descriptions
 * @module bom/services/embeddingService
 *
 * Uses OpenAI text-embedding-3-large model (3072 dimensions) for generating
 * embeddings. Includes description normalization and batch processing.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import logger from '../../../src/utils/logger.js';

const EMBEDDING_MODEL = 'text-embedding-3-large';
const EMBEDDING_DIMENSIONS = 3072;
const BATCH_SIZE = 100;
const RATE_LIMIT_DELAY_MS = 200;

/**
 * Normalize a SKU description for consistent embedding generation.
 * Lowercases, strips special characters, collapses whitespace,
 * and removes common filler words.
 * @param {string} text Raw description text
 * @returns {string} Normalized text
 */
export function normalizeDescription(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s/.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate an embedding vector for a single text string.
 * @param {string} text Text to embed
 * @returns {Promise<number[]>} Embedding vector (3072 dimensions)
 */
export async function generateEmbedding(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const normalized = normalizeDescription(text);
  if (!normalized) throw new Error('Cannot generate embedding for empty text');

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: normalized,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${body}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts with rate limiting.
 * Processes in batches of BATCH_SIZE with RATE_LIMIT_DELAY_MS between batches.
 * @param {string[]} texts Array of texts to embed
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
export async function batchGenerateEmbeddings(texts) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const normalized = texts.map(normalizeDescription);
  const results = [];

  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    const batch = normalized.slice(i, i + BATCH_SIZE);

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${body}`);
    }

    const data = await response.json();
    // OpenAI returns embeddings sorted by index
    const sorted = data.data.sort((a, b) => a.index - b.index);
    results.push(...sorted.map((d) => d.embedding));

    // Rate limiting between batches
    if (i + BATCH_SIZE < normalized.length) {
      logger.info(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1} complete, delaying ${RATE_LIMIT_DELAY_MS}ms`);
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
    }
  }

  return results;
}

export { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS };
