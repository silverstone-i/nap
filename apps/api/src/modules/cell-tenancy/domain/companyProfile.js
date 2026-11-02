/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Outbox rows that carry a customer tenant's company profile to the
 * admin database (I0013): its primary and billing contacts, its tax ID
 * submission, and, from the Napsoft cell, client renames and tax ID
 * decisions. Each writer runs in the caller's cell transaction, so the row
 * commits with the change it reports.
 */

import { parseSnapshot } from '../../../application/sync/snapshots.js';
import { PortalAccessError } from './portalAccess.js';

/**
 * Validate a payload against its topic's snapshot and append it as the
 * entity's next revision.
 * @param {object} tx The caller's cell transaction.
 * @param {string} topic
 * @param {string} entityId
 * @param {object} payload
 * @returns {Promise<{revision: number}>}
 * @throws {PortalAccessError} `INVALID_INPUT`
 */
async function enqueue(tx, topic, entityId, payload) {
  if (!parseSnapshot(topic, payload))
    throw new PortalAccessError('INVALID_INPUT');
  await tx.one('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `cell.outbox|${topic}|${entityId}`,
  ]);
  const revision = await tx.outbox.nextRevision(topic, entityId, { tx });
  await tx.outbox.insert(
    {
      tenant_id: payload.tenant_id,
      topic,
      entity_id: entityId,
      revision,
      payload,
    },
    { tx }
  );
  return { revision };
}

/**
 * Report a primary or billing contact as it now stands (I0013-R015). Both
 * flags false removes it from Napsoft's copy.
 * @param {object} tx
 * @param {object} contact `tenant_contact` snapshot fields.
 * @returns {Promise<{revision: number}>}
 */
export function requestTenantContact(tx, contact) {
  return enqueue(tx, 'tenant_contact', contact.party_id, contact);
}

/**
 * Report a Napsoft client's new legal and DBA name for its tenant
 * (I0013-R006). Runs in the Napsoft cell.
 * @param {object} tx
 * @param {{tenant_id: string, target_tenant_id: string, legal_name: string, dba_name: string|null}} change
 * @returns {Promise<{revision: number}>}
 */
export function requestClientName(tx, change) {
  return enqueue(tx, 'client_name', change.target_tenant_id, change);
}

/**
 * Submit a customer tenant's tax ID for Napsoft's approval (I0013-R019).
 * The returned revision identifies the request in admin.
 * @param {object} tx
 * @param {{tenant_id: string, tax_id_encrypted: string, tax_id_last4: string, country: string}} request
 * @returns {Promise<{revision: number}>}
 */
export function requestTaxId(tx, request) {
  return enqueue(tx, 'tax_id_request', request.tenant_id, request);
}

/**
 * Record Napsoft's decision on a tenant's tax ID request (I0013-R022,
 * R023). Runs in the Napsoft cell. An approval also carries the client
 * and the tax ID encrypted for it, which admin forwards to the Napsoft cell
 * once it accepts the decision.
 * @param {object} tx
 * @param {{tenant_id: string, target_tenant_id: string, request_revision: number, status: 'approved'|'rejected', reason: string|null, client_id?: string, client_tax_id?: {tax_id_format_id: string, tax_id_encrypted: string, tax_id_hash: string, tax_id_last4: string}}} decision
 * @returns {Promise<{revision: number}>}
 */
export function requestTaxIdDecision(tx, decision) {
  return enqueue(tx, 'tax_id_decision', decision.target_tenant_id, decision);
}
