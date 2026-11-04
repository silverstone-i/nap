/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file A customer tenant's company profile (I0013): its employees that hold
 * contact roles (I0014), its own tax ID and the request waiting for
 * Napsoft, and Napsoft's side of the same data. Changes reach the admin
 * database through the cell outbox (I0004).
 */

import { z } from 'zod';
import { contactDetailsOf } from './contactRoles.js';
import { DirectoryError } from './errors.js';
import {
  COMPANY_PROFILE_WRITE,
  mutate,
  parse,
  parseId,
  read,
  requireCapability,
} from './shared.js';
import { activeTaxIdFormat } from './taxIdFormats.js';
import {
  requestClientName,
  requestTaxId,
  requestTaxIdDecision,
} from '../../cell-tenancy/domain/companyProfile.js';

export { COMPANY_PROFILE_WRITE };
export const TAX_IDS_APPROVE = 'business-directory::tax-ids::approve';

/**
 * Refuse a company profile action in the Napsoft tenant, which has no
 * company profile of its own (I0013 §4).
 * @param {import('./shared.js').DirectoryContext} context
 * @returns {void}
 * @throws {DirectoryError} `INVALID_STATE`
 */
function requireCustomerTenant(context) {
  if (context.tenant.isNapsoft) throw new DirectoryError('INVALID_STATE');
}

/**
 * Refuse a Napsoft-only action anywhere else.
 * @param {import('./shared.js').DirectoryContext} context
 * @returns {void}
 * @throws {DirectoryError} `INVALID_STATE`
 */
function requireNapsoft(context) {
  if (!context.tenant.isNapsoft) throw new DirectoryError('INVALID_STATE');
}

/**
 * The company profile a customer tenant sees (I0013-R026): its names, tax
 * ID status, and its employees grouped by system role (I0014-R031).
 * @param {import('./shared.js').DirectoryContext} context
 * @returns {Promise<object>}
 */
export function getCompanyProfile(context) {
  requireCustomerTenant(context);
  return read(context, async tx => {
    const tenant = await tx.oneOrNone(
      'SELECT legal_name, dba_name FROM cell.tenants WHERE id=$1',
      [context.tenant.id]
    );
    const tax = await tx.oneOrNone(
      'SELECT * FROM app.tenant_tax_ids WHERE tenant_id=$1',
      [context.tenant.id]
    );
    const holders = await tx.any(
      `SELECT p.party_id, p.first_name, p.last_name, p.revision,
              array_agg(DISTINCT r.role) AS roles
         FROM app.people p
         JOIN app.contact_roles r ON r.person_id=p.party_id
        WHERE p.tenant_id=$1 AND p.organization_id IS NULL
          AND p.deactivated_at IS NULL
          AND r.role IS NOT NULL AND r.deactivated_at IS NULL
        GROUP BY p.party_id
        ORDER BY p.last_name, p.first_name, p.party_id`,
      [context.tenant.id]
    );
    const detailsOf = await contactDetailsOf(
      tx,
      holders.map(person => person.party_id)
    );
    const contacts = holders.map(person => {
      const details = detailsOf.get(person.party_id);
      return {
        id: person.party_id,
        firstName: person.first_name,
        lastName: person.last_name,
        email: details.email,
        phone: details.phone,
        roles: person.roles,
        revision: person.revision,
      };
    });
    const holding = role => contacts.filter(c => c.roles.includes(role));
    return {
      legalName: tenant?.legal_name ?? null,
      dbaName: tenant?.dba_name ?? null,
      taxId: {
        last4: tax?.tax_id_last4 ?? null,
        formatId: tax?.tax_id_format_id ?? null,
        status: tax?.pending_status ?? (tax?.tax_id_last4 ? 'approved' : null),
        pendingLast4: tax?.pending_last4 ?? null,
        reason: tax?.pending_reason ?? null,
      },
      primaryContacts: holding('primary'),
      billingContacts: holding('billing'),
      notificationContacts: holding('notifications'),
    };
  });
}

const taxIdSchema = z.strictObject({
  taxId: z.string().min(1).max(64),
  taxIdFormatId: z.uuid(),
});

/**
 * Submit the tenant's tax ID for Napsoft's approval (I0013-R019). A new
 * submission replaces a pending one; the approved value stays in effect.
 * The value is encrypted for the tenant's own row (`tenantId:tenantId`).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} body
 * @returns {Promise<object>} The company profile.
 * @throws {DirectoryError} `FORBIDDEN`, `INVALID_INPUT`
 */
export async function submitTaxId(context, body) {
  requireCustomerTenant(context);
  await requireCapability(context, COMPANY_PROFILE_WRITE);
  const input = parse(taxIdSchema, body);
  await mutate(context, async tx => {
    const format = await activeTaxIdFormat(context, tx, input.taxIdFormatId);
    const columns = context.taxIds.protect(input.taxId, format, {
      tenantId: context.tenant.id,
      partyId: context.tenant.id,
    });
    const { revision } = await requestTaxId(tx, {
      tenant_id: context.tenant.id,
      tax_id_encrypted: columns.tax_id_encrypted,
      tax_id_last4: columns.tax_id_last4,
      country: format.country,
    });
    await tx.none(
      `INSERT INTO app.tenant_tax_ids
         (tenant_id, pending_format_id, pending_encrypted, pending_last4,
          pending_status, pending_revision, created_by, updated_by)
       VALUES ($1,$2,$3,$4,'pending',$5,$6,$6)
       ON CONFLICT (tenant_id) DO UPDATE SET
         pending_format_id=EXCLUDED.pending_format_id,
         pending_encrypted=EXCLUDED.pending_encrypted,
         pending_last4=EXCLUDED.pending_last4, pending_status='pending',
         pending_reason=NULL, pending_revision=EXCLUDED.pending_revision,
         revision=app.tenant_tax_ids.revision+1,
         updated_by=EXCLUDED.updated_by`,
      [
        context.tenant.id,
        format.id,
        columns.tax_id_encrypted,
        columns.tax_id_last4,
        revision,
        context.actorId,
      ]
    );
    return {
      result: null,
      changes: [
        {
          eventKey: 'directory.tax_id_request.submitted',
          recordId: context.tenant.id,
          details: { after: columns.tax_id_last4 },
        },
      ],
    };
  });
  return getCompanyProfile(context);
}

/**
 * The customer tenant a Napsoft client belongs to, from admin.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {string} clientId
 * @returns {Promise<object|null>}
 */
export async function tenantOfClient(context, clientId) {
  if (!context.admin) throw new DirectoryError('SERVICE_UNAVAILABLE');
  return context.admin.tenants.findOneBy(
    { client_id: clientId },
    {
      columnWhitelist: ['id', 'client_id', 'deactivated_at'],
      includeDeactivated: true,
    }
  );
}

/**
 * Queue a Napsoft client's new names for its tenant (I0013-R006). Called in
 * the transaction that saves the rename.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} tx
 * @param {{party_id: string, legal_name: string, dba_name: string|null}} organization
 * @returns {Promise<void>}
 */
export async function queueClientName(context, tx, organization) {
  const tenant = await tenantOfClient(context, organization.party_id);
  if (!tenant) return;
  await requestClientName(tx, {
    tenant_id: context.tenant.id,
    target_tenant_id: tenant.id,
    legal_name: organization.legal_name,
    dba_name: organization.dba_name ?? null,
  });
}

/**
 * Refuse archiving a Napsoft client whose tenant is active (I0013-R030).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {string} clientId
 * @returns {Promise<void>}
 * @throws {DirectoryError} `INVALID_STATE`
 */
export async function requireClientArchivable(context, clientId) {
  const tenant = await tenantOfClient(context, clientId);
  if (tenant && !tenant.deactivated_at)
    throw new DirectoryError('INVALID_STATE');
}

/**
 * The pending tax ID request of a Napsoft client's tenant.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {string} clientId
 * @returns {Promise<{tenant: object, request: object}>}
 * @throws {DirectoryError} `NOT_FOUND`, `INVALID_STATE`
 */
async function pendingRequest(context, clientId) {
  const tenant = await tenantOfClient(context, clientId);
  if (!tenant) throw new DirectoryError('NOT_FOUND');
  const request = await context.admin.tenant_tax_id_requests.findOneBy({
    tenant_id: tenant.id,
  });
  if (request?.status !== 'pending') throw new DirectoryError('INVALID_STATE');
  return { tenant, request };
}

const approveSchema = z.strictObject({ taxIdFormatId: z.uuid() });
const rejectSchema = z.strictObject({
  reason: z.string().trim().min(1).max(500),
});

/**
 * Refuse a second decision on a request whose first is still on its way to
 * admin, so a client is never approved twice for one request.
 * @param {object} tx
 * @param {string} tenantId The customer tenant.
 * @param {number} requestRevision
 * @returns {Promise<void>}
 * @throws {DirectoryError} `INVALID_STATE`
 */
async function requireUndecided(tx, tenantId, requestRevision) {
  const decided = await tx.oneOrNone(
    `SELECT 1 FROM cell.outbox
      WHERE topic='tax_id_decision' AND entity_id=$1
        AND (payload->>'request_revision')::int=$2
      LIMIT 1`,
    [tenantId, requestRevision]
  );
  if (decided) throw new DirectoryError('INVALID_STATE');
}

/**
 * Lock a Napsoft client for a tax ID decision.
 * @param {object} tx
 * @param {string} clientId
 * @returns {Promise<object>}
 * @throws {DirectoryError} `NOT_FOUND`
 */
async function lockClient(tx, clientId) {
  const client = await tx.oneOrNone(
    `SELECT x.id, x.kind FROM app.parties x
       JOIN app.organizations o ON o.party_id=x.id
      WHERE x.id=$1 AND x.kind='client' AND o.deactivated_at IS NULL
      FOR UPDATE OF x`,
    [clientId]
  );
  if (!client) throw new DirectoryError('NOT_FOUND');
  return client;
}

/**
 * Approve a tenant's pending tax ID (I0013-R022): queue the decision with
 * the value encrypted for the Napsoft client in the Napsoft tenant's
 * format. Admin forwards the decision to the tenant and the value to the
 * client only if the request is still the pending one. The value is
 * decrypted for the tenant's row and encrypted again for the client's.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} clientId
 * @param {unknown} body `{ taxIdFormatId }`, a Napsoft format of the request's country.
 * @returns {Promise<{taxIdLast4: string}>}
 * @throws {DirectoryError} `FORBIDDEN`, `INVALID_INPUT`, `NOT_FOUND`, `INVALID_STATE`, `DUPLICATE_TAX_ID`
 */
export async function approveTaxIdRequest(context, clientId, body) {
  requireNapsoft(context);
  await requireCapability(context, TAX_IDS_APPROVE);
  const id = parseId(clientId);
  const input = parse(approveSchema, body);
  const { tenant, request } = await pendingRequest(context, id);
  return mutate(context, async tx => {
    await lockClient(tx, id);
    await requireUndecided(tx, tenant.id, request.revision);
    const format = await activeTaxIdFormat(context, tx, input.taxIdFormatId);
    if (format.country !== request.country)
      throw new DirectoryError('INVALID_STATE');
    const canonical = context.taxIds.reveal(request.tax_id_encrypted, {
      tenantId: tenant.id,
      partyId: tenant.id,
    });
    const columns = context.taxIds.protect(canonical, format, {
      tenantId: context.tenant.id,
      partyId: id,
    });
    const holder = await context.cell.parties.holderOfTaxId(
      'client',
      columns.tax_id_hash,
      id,
      { tx }
    );
    if (holder)
      throw new DirectoryError('DUPLICATE_TAX_ID', {
        id: holder.id,
        archived: holder.archived,
      });
    // The client takes the tax ID once admin accepts the decision.
    await requestTaxIdDecision(tx, {
      tenant_id: context.tenant.id,
      target_tenant_id: tenant.id,
      request_revision: request.revision,
      status: 'approved',
      reason: null,
      client_id: id,
      client_tax_id: {
        tax_id_format_id: columns.tax_id_format_id,
        tax_id_encrypted: columns.tax_id_encrypted,
        tax_id_hash: columns.tax_id_hash,
        tax_id_last4: columns.tax_id_last4,
      },
    });
    return {
      result: { taxIdLast4: columns.tax_id_last4 },
      changes: [
        {
          eventKey: 'directory.tax_id_request.approved',
          recordId: id,
          details: { after: columns.tax_id_last4 },
        },
      ],
    };
  });
}

/**
 * Reject a tenant's pending tax ID with a reason (I0013-R023). The client's
 * tax ID does not change.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} clientId
 * @param {unknown} body `{ reason }`.
 * @returns {Promise<null>}
 * @throws {DirectoryError} `FORBIDDEN`, `INVALID_INPUT`, `NOT_FOUND`, `INVALID_STATE`
 */
export async function rejectTaxIdRequest(context, clientId, body) {
  requireNapsoft(context);
  await requireCapability(context, TAX_IDS_APPROVE);
  const id = parseId(clientId);
  const input = parse(rejectSchema, body);
  const { tenant, request } = await pendingRequest(context, id);
  return mutate(context, async tx => {
    await lockClient(tx, id);
    await requireUndecided(tx, tenant.id, request.revision);
    await requestTaxIdDecision(tx, {
      tenant_id: context.tenant.id,
      target_tenant_id: tenant.id,
      request_revision: request.revision,
      status: 'rejected',
      reason: input.reason,
    });
    return {
      result: null,
      changes: [
        {
          eventKey: 'directory.tax_id_request.rejected',
          recordId: id,
          details: { after: request.tax_id_last4 },
        },
      ],
    };
  });
}
