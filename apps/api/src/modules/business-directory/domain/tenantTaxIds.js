/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file A customer tenant's own tax ID (I0013-R019–R024): the approved
 * value in effect and the submitted value waiting for Napsoft.
 */

import { setTenant } from '../../../infrastructure/runtime/tenantTransaction.js';

/**
 * Apply Napsoft's decision to the tenant's pending tax ID (I0013-R024). The
 * sync worker calls it in its cell transaction. A decision on a request the
 * tenant has since replaced changes nothing.
 * @param {object} tx The worker's cell transaction.
 * @param {{tenant_id: string, request_revision: number, status: 'approved'|'rejected', reason: string|null}} decision
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
  if (decision.status === 'approved')
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
  else
    await tx.none(
      `UPDATE app.tenant_tax_ids SET pending_status='rejected',
         pending_reason=$2, revision=revision+1, updated_by=$3
       WHERE tenant_id=$1`,
      [decision.tenant_id, decision.reason, actorId]
    );
  return 'applied';
}
