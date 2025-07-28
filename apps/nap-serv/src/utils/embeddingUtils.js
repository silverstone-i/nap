// embeddingUtils.js
// Utility for generating embedding vectors for SKUs
import { OpenAI } from 'openai';

/**
 * Generate embedding vectors for an array of SKUs using a model/service.
 * @param {Array<Object>} skus - Array of SKU objects (must include id and text fields)
 * @param {Object} options - Embedding options
 * @param {string} options.model - Embedding model name
 * @param {string} options.inputType - Which field(s) to use for embedding (e.g., 'description', 'title')
 * @param {string} source - Source type ('vendor' or 'catalog')
 * @param {function} embeddingService - Function to call for embedding (async)
 * @returns {Promise<Array<{tenant_code: string, sku_id: string, source: string, model: string, input_type: string, embedding: number[]}>>}
 */
export async function generateEmbeddingsForSkus(skus, { model, inputType }, source, embeddingService) {
  // Prepare batch input texts
  const texts = skus.map(sku => {
    if (inputType === 'description') {
      return sku.description;
    } else if (inputType === 'title') {
      return sku.title;
    } else {
      return sku.description || sku.title || '';
    }
  });
  // Call embedding service/model in batch
  const embeddings = await embeddingService(texts, model);
  // Map embeddings back to SKUs with all required fields
  return skus.map((sku, i) => ({
    tenant_code: sku.tenant_code,
    sku_id: sku.id,
    source,
    model,
    input_type: inputType,
    embedding: embeddings[i],
  }));
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Calls OpenAI's embedding API for a batch of texts and model.
 * @param {string[]|string} texts - The input text(s) to embed.
 * @param {string} model - The embedding model name (e.g., 'text-embedding-3-small').
 * @returns {Promise<number[][]>} - Array of embedding vectors.
 */
export async function openaiEmbeddingService(texts, model = 'text-embedding-3-small') {
  // Accept single string or array
  const inputArr = Array.isArray(texts) ? texts : [texts];
  const cleaned = inputArr.map(t => (typeof t === 'string' ? t.trim().replace(/\s+/g, ' ') : ''));
  const response = await openai.embeddings.create({
    model,
    input: cleaned,
  });
  if (!response.data || !Array.isArray(response.data) || response.data.length !== cleaned.length) {
    throw new Error('Invalid response from OpenAI embedding API');
  }
  return response.data.map(item => item.embedding);
}

/**
 * Compute cosine similarity between two vectors
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
export function cosineSimilarity(a, b) {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Match vendor embeddings to catalog embeddings.
 * @param {Array<Object>} vendorEmbeddings - Array of vendor embedding objects
 * @param {Array<Object>} catalogEmbeddings - Array of catalog embedding objects
 * @param {Object} [options] - Optional config (e.g., minConfidence)
 * @returns {Object} { matches: Array, lowConfidence: Array }
 */
export function matchVendorToCatalogEmbeddings(vendorEmbeddings, catalogEmbeddings, options = {}) {
  const minConfidence = options.minConfidence ?? 0;
  if (!catalogEmbeddings.length || !vendorEmbeddings.length) return { matches: [], lowConfidence: [] };

  const matches = [];
  const lowConfidence = [];
  for (const vendor of vendorEmbeddings) {
    let bestMatch = null;
    let bestScore = -Infinity;
    for (const catalog of catalogEmbeddings) {
      const score = cosineSimilarity(vendor.embedding, catalog.embedding);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = catalog;
      }
    }
    const matchResult = {
      vendor,
      catalog: bestMatch,
      confidence: bestScore,
    };
    if (bestMatch && bestScore >= minConfidence) {
      matches.push(matchResult);
    } else if (bestMatch) {
      lowConfidence.push(matchResult);
    }
  }
  return { matches, lowConfidence };
}
