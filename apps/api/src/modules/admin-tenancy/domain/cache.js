/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Domains stored in `admin.cache_revisions`. */
export const REVISION_DOMAINS = Object.freeze([
  'user',
  'session',
  'roles',
  'membership',
  'tenant',
  'cell',
  'entitlement',
]);

const domainSet = new Set(REVISION_DOMAINS);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Sentinel entity for a domain-wide collection revision, distinct from any
 * entity UUID. A newly created entity has no UUID that a previously cached
 * list could already depend on, so a per-entity key can never invalidate
 * that list; a collection key that every such list includes can.
 */
export const COLLECTION_ENTITY = 'list';

/** Stable, detail-free failure from revision or cache operations. */
export class CacheConsistencyError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

/**
 * Validate, normalize, and sort revision keys.
 * @param {unknown} keys
 * @returns {{domain: string, entity: string}[]}
 * @throws {CacheConsistencyError} `INVALID_INPUT`
 */
export function normalizeRevisionKeys(keys) {
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > 64)
    throw new CacheConsistencyError('INVALID_INPUT');
  const normalized = keys.map(key => {
    if (
      !key ||
      typeof key !== 'object' ||
      Array.isArray(key) ||
      Object.keys(key).sort().join(',') !== 'domain,entity' ||
      !domainSet.has(key.domain) ||
      typeof key.entity !== 'string' ||
      (key.entity !== COLLECTION_ENTITY && !uuidPattern.test(key.entity))
    )
      throw new CacheConsistencyError('INVALID_INPUT');
    return {
      domain: key.domain,
      entity:
        key.entity === COLLECTION_ENTITY
          ? COLLECTION_ENTITY
          : key.entity.toLowerCase(),
    };
  });
  normalized.sort(
    (left, right) =>
      left.domain.localeCompare(right.domain) ||
      left.entity.localeCompare(right.entity)
  );
  const identities = normalized.map(key => `${key.domain}:${key.entity}`);
  if (new Set(identities).size !== identities.length)
    throw new CacheConsistencyError('INVALID_INPUT');
  return normalized;
}

/**
 * Return whether two revision vectors contain the same canonical entries.
 * @param {unknown} cached
 * @param {{domain: string, entity: string, revision: string}[]} current
 * @returns {boolean}
 */
export function revisionVectorsMatch(cached, current) {
  if (!Array.isArray(cached) || cached.length !== current.length) return false;
  return current.every((entry, index) => {
    const candidate = cached[index];
    return (
      candidate &&
      typeof candidate === 'object' &&
      !Array.isArray(candidate) &&
      Object.keys(candidate).sort().join(',') === 'domain,entity,revision' &&
      candidate.domain === entry.domain &&
      candidate.entity === entry.entity &&
      candidate.revision === entry.revision
    );
  });
}
