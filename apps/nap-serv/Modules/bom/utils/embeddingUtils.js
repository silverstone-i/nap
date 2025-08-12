'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

/*
 * Utility functions for description normalization and embedding generation
 */

import OpenAI from 'openai';
import _ from 'lodash';
import { distance } from 'fastest-levenshtein';

/**
 * Normalize a description string: lowercases, trims, removes extra whitespace, expands common abbreviations, etc.
 * @param {string} text
 * @returns {string}
 */
export const ABBREVIATION_MAP = {
  SPF: 'spruce-pine-fir',
  OSB: 'oriented strand board',
  MDF: 'medium-density fiberboard',
  CDX: 'cd exposure plywood',
  'T&G': 'tongue and groove',
  PVC: 'polyvinyl chloride',
  T111: 't 111 siding',
  'T-111': 't 111 siding',
  PT: 'pressure treated',
  EG: 'electro-galvanized',
  HWH: 'hex washer head',
  GWB: 'gypsum wall board',
  LVL: 'laminated veneer lumber',
};

const MARKETING_NOISE_PATTERNS = [/\bused for\b.*?(\.|$)/gi, /\bideal for\b.*?(\.|$)/gi, /\bperfect for\b.*?(\.|$)/gi, /\bcan be used for\b.*?(\.|$)/gi];

export function normalizeDescription(raw) {
  try {
    if (!raw) return '';

    let desc = raw.toLowerCase();

    // Reformat dimensional lumber patterns like "2 x 4 x 8 ft" → "8 ft 2 in x 4 in"
    desc = desc.replace(/(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+)\s*(ft|in)?/gi, (_, w, h, l, unit) => {
      const width = `${w} in`;
      const height = `${h} in`;
      const length = unit === 'in' ? `${l} in` : `${l} ft`;
      return `${length} ${width} x ${height}`;
    });

    // Normalize Unicode mixed fractions like 1¾ → 1 3/4
    desc = desc
      .replace(/(\d+)\s*¾/g, '$1 3/4')
      .replace(/(\d+)\s*½/g, '$1 1/2')
      .replace(/(\d+)\s*⅝/g, '$1 5/8')
      .replace(/(\d+)\s*⅜/g, '$1 3/8')
      .replace(/(\d+)\s*⅞/g, '$1 7/8')
      .replace(/(\d+)\s*¼/g, '$1 1/4')
      .replace(/¾/g, '3/4')
      .replace(/½/g, '1/2')
      .replace(/⅝/g, '5/8')
      .replace(/⅜/g, '3/8')
      .replace(/⅞/g, '7/8')
      .replace(/¼/g, '1/4');

    // Fallback for 2 x 4 dimensional pattern
    desc = desc.replace(/(\d+)\s*x\s*(\d+)\b(?!\s*x)/gi, '$1 in x $2 in');

    // Convert mixed numbers like "1 3/4" to decimals
    desc = desc.replace(/(\d+)\s+(\d+)\/(\d+)/g, (_, whole, num, denom) => {
      const value = parseInt(whole) + parseFloat(num) / parseFloat(denom);
      return value.toFixed(4).replace(/\.0+$/, '');
    });

    // Replace ASCII fractions with decimals
    desc = desc.replace(/(\d+)\s?\/\s?(\d+)/g, (_, num, denom) => {
      const value = parseFloat(num) / parseFloat(denom);
      return value.toFixed(4).replace(/\.0+$/, '');
    });

    // Normalize dimension symbols and punctuation
    desc = desc
      .replace(/×|x/gi, ' x ')
      .replace(/′|’|'/g, ' ft')
      .replace(/″|"/g, ' in')
      .replace(/–|—/g, '-') // en-dash/em-dash to hyphen
      .replace(/\s+/g, ' '); // collapse whitespace

    // Ensure decimal numbers like "0.75" are spaced
    desc = desc.replace(/(\d+\.\d+)(?=\w)/g, '$1 ');

    // Expand abbreviations
    for (const [abbr, full] of Object.entries(ABBREVIATION_MAP)) {
      const regex = new RegExp(`\\b${abbr}\\b`, 'gi');
      desc = desc.replace(regex, full);
    }

    // Normalize compound units like "1-lb" to "1 lb"
    desc = desc.replace(/(\d+)\s*-\s*(lb|ft|in|sqft|oz)/gi, '$1 $2');

    // Remove common marketing filler
    for (const pattern of MARKETING_NOISE_PATTERNS) {
      desc = desc.replace(pattern, '');
    }

    // Remove repeated words like "board board"
    desc = desc.replace(/\b(\w+)\s+\1\b/g, '$1');

    // Update removal of marketing/packaging words to preserve meaningful words like 'sheet', 'panel', etc.
    desc = desc.replace(/\b(pack|box|bundle|each|roll)\b\s*(of)?/gi, '');

    // Strip trailing punctuation
    desc = desc.replace(/[^\w\s]$/g, '');

    // Reorder unit mentions to standard: ft, in, lb, oz
    desc = desc.replace(/\b(\d+(\.\d+)?)( in| ft| lb| oz)\b/g, '$1$3'); // normalize spacing
    const unitOrder = ['ft', 'in', 'lb', 'oz'];
    const parts = desc.split(' ');
    parts.sort((a, b) => {
      const aIdx = unitOrder.findIndex(u => a.endsWith(u));
      const bIdx = unitOrder.findIndex(u => b.endsWith(u));
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      return 0;
    });
    desc = parts.join(' ');

    return desc.trim();
  } catch (err) {
    console.error('Error normalizing description:', err);
    return '';
  }
}

/**
 * Create an embedding vector for a string using the OpenAI API
 * @param {string} text
 * @param {string} [model='text-embedding-3-large']
 * @returns {Promise<{ embedding: number[], model: string }>}
 */
export async function generateEmbedding(text, model = 'text-embedding-3-large') {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');
    const openai = new OpenAI({ apiKey });
    const response = await openai.embeddings.create({
      input: text,
      model,
    });
    const embedding = response.data[0].embedding;
    return { embedding, model };
  } catch (err) {
    console.error('Error creating embedding:', err);
    throw err;
  }
}

/*
 * Utility to match a vendor embedding to catalog embeddings using cosine similarity
 */

/**
 * Compute cosine similarity between two vectors
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

/**
 * Find the best catalog match for a vendor embedding
 * @param {number[]} vendorEmbedding
 * @param {Array<{id: string, embedding: number[]}>} catalogRows
 * @param {number} threshold
 * @returns {{id: string, confidence: number}|null}
 */
export function matchToCatalog(vendorEmbedding, catalogRows, threshold = 0.85) {
  let best = null;
  for (const row of catalogRows) {
    if (!row.embedding) continue;
    const sim = cosineSimilarity(vendorEmbedding, row.embedding);
    if (!best || sim > best.confidence) {
      best = { id: row.id, confidence: sim };
    }
  }
  return best;
}

function jaccardSimilarity(a, b) {
  const tokensA = a.toLowerCase().split(/\W+/);
  const tokensB = b.toLowerCase().split(/\W+/);
  const intersection = _.intersection(tokensA, tokensB);
  const union = _.union(tokensA, tokensB);
  return union.length === 0 ? 0 : intersection.length / union.length;
}

function fuzzySimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - distance(a, b) / maxLen;
}

export function combinedSimilarity(a, b) {
  const jac = jaccardSimilarity(a, b);
  const fuzz = fuzzySimilarity(a, b);
  return 0.5 * jac + 0.5 * fuzz;
}
