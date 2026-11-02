/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file A customer tenant's own tax ID (I0013-R019–R024): the approved
 * value in effect and the submitted value waiting for Napsoft; and the
 * approved value on the tenant's Napsoft client.
 */

import { setTenant } from '../../../infrastructure/runtime/tenantTransaction.js';
import { requestTaxIdApplied } from '../../cell-tenancy/domain/companyProfile.js';

/**
 * Apply Napsoft's decision to the tenant's pending tax ID (I0013-R024). The
 * sync worker calls it in its cell transaction. A decision on a request the
 * tenant has since replaced changes nothing. An applied approval that
 * carries the Napsoft client's tax ID confirms it to admin, which then
 * gives the client the tax ID (R022).
 * @param {object} tx The worker's cell transaction.
 * @param {{tenant_id: string, request_revision: number, status: 'approved'|'rejected', reason: string|null, client_id?: string, client_tax_id?: object}} decision
 * @param {string|null} actorId
 * @returns {Promise<'applied'|'unchanged'>}
 */
export async function applyTaxIdDecision(tx, decision, actorId) {
  // The sync apply runs outside a tenant transaction; `app` tables need the
  // tenant setting for row-level security.
  await setTenant(tx, decision.tenant_id);
  const current = await tx.oneOrNone(
    'SELECT pending_status, pending_revision FROM app.tenant_tax_ids WHERE tenant_id=$1 FOR UPDATE',
    [decision.tenant_id]
  );
  if (
    current?.pending_status !== 'pending' ||
    current.pending_revision !== decision.request_revision
  )
    return 'unchanged';
  if (decision.status === 'approved') {
    await tx.none(
      `UPDATE app.tenant_tax_ids SET
         tax_id_format_id=pending_format_id,
         tax_id_encrypted=pending_encrypted,
         tax_id_last4=pending_last4,
         pending_format_id=NULL, pending_encrypted=NULL, pending_last4=NULL,
         pending_status=NULL, pending_reason=NULL, pending_revision=NULL,
         revision=revision+1, updated_by=$2
       WHERE tenant_id=$1`,
      [decision.tenant_id, actorId]
    );
    if (decision.client_id && decision.client_tax_id)
      await requestTaxIdApplied(tx, {
        tenant_id: decision.tenant_id,
        request_revision: decision.request_revision,
        client_id: decision.client_id,
        client_tax_id: decision.client_tax_id,
      });
  } else
    await tx.none(
      `UPDATE app.tenant_tax_ids SET pending_status='rejected',
         pending_reason=$2, revision=revision+1, updated_by=$3
       WHERE tenant_id=$1`,
      [decision.tenant_id, decision.reason, actorId]
    );
  return 'applied';
}

/**
 * Set an approved tax ID on a Napsoft client (I0013-R022). The sync worker
 * calls it in the Napsoft cell's transaction once admin has accepted the
 * approval. The approval already refused a tax ID another client holds;
 * should one take it meanwhile, the client keeps its value.
 * @param {object} tx The worker's cell transaction.
 * @param {{tenant_id: string, client_id: string, tax_id_format_id: string, tax_id_encrypted: string, tax_id_hash: string, tax_id_last4: string}} row
 * @param {string|null} actorId
 * @returns {Promise<'applied'|'unchanged'>}
 */
export async function applyClientTaxId(tx, row, actorId) {
  await setTenant(tx, row.tenant_id);
  const updated = await tx.oneOrNone(
    `UPDATE app.parties SET tax_id_format_id=$3, tax_id_encrypted=$4,
       tax_id_hash=$5, tax_id_last4=$6, updated_by=$7
     WHERE id=$2 AND tenant_id=$1 AND kind='client'
       AND NOT EXISTS (
         SELECT 1 FROM app.parties o
          WHERE o.tenant_id=$1 AND o.kind='client' AND o.id<>$2
            AND o.tax_id_hash=$5)
     RETURNING id`,
    [
      row.tenant_id,
      row.client_id,
      row.tax_id_format_id,
      row.tax_id_encrypted,
      row.tax_id_hash,
      row.tax_id_last4,
      actorId,
    ]
  );
  return updated ? 'applied' : 'unchanged';
}
