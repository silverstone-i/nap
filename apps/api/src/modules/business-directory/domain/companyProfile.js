/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file A customer tenant's company profile (I0013): its primary and billing
 * contacts among its employees, its own tax ID and the request waiting for
 * Napsoft, and Napsoft's side of the same data. Changes reach the admin
 * database through the cell outbox (I0004).
 */

import { z } from 'zod';
import { DirectoryError } from './errors.js';
import { mutate, parse, parseId, read, requireCapability } from './shared.js';
import { activeTaxIdFormat } from './taxIdFormats.js';
import {
  requestClientName,
  requestTaxId,
  requestTaxIdDecision,
  requestTenantContact,
} from '../../cell-tenancy/domain/companyProfile.js';

export const COMPANY_PROFILE_WRITE =
  'business-directory::company-profile::write';
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
 * A party's primary email, primary phone, and phone labeled `billing`
 * (I0013-R011).
 * @param {object} tx
 * @param {string} partyId
 * @returns {Promise<{email: string|null, phone: string|null, billingPhone: string|null}>}
 */
async function contactDetails(tx, partyId) {
  const row = await tx.one(
    `SELECT
       (SELECT value FROM app.contact_methods
         WHERE party_id=$1 AND type='email' AND is_primary
           AND deactivated_at IS NULL LIMIT 1) AS email,
       (SELECT value FROM app.contact_methods
         WHERE party_id=$1 AND type='phone' AND is_primary
           AND deactivated_at IS NULL LIMIT 1) AS phone,
       (SELECT m.value FROM app.contact_methods m
          JOIN app.contact_labels l ON l.id=m.label_id
         WHERE m.party_id=$1 AND m.type='phone' AND l.applies_to='phone'
           AND l.name='billing' AND m.deactivated_at IS NULL
         ORDER BY m.is_primary DESC, m.created_at LIMIT 1) AS billing_phone`,
    [partyId]
  );
  return {
    email: row.email,
    phone: row.phone,
    billingPhone: row.billing_phone,
  };
}

/**
 * An employee's `people` row, or null for any other party.
 * @param {object} tx
 * @param {string} partyId
 * @returns {Promise<object|null>}
 */
async function employee(tx, partyId) {
  return tx.oneOrNone(
    `SELECT p.* FROM app.people p JOIN app.parties x ON x.id=p.party_id
      WHERE p.party_id=$1 AND x.kind='employee'`,
    [partyId]
  );
}

/**
 * Whether an employee is an active primary or billing contact.
 * @param {object|null} person
 * @returns {boolean}
 */
export function isCompanyContact(person) {
  return Boolean(
    person &&
    !person.deactivated_at &&
    (person.is_primary_contact || person.is_billing_contact)
  );
}

/**
 * Require a flagged employee's contact details (I0013-R011): a primary
 * email, a primary phone for a primary contact, and a billing phone for the
 * billing contact.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} tx
 * @param {string} partyId
 * @returns {Promise<void>}
 * @throws {DirectoryError} `CONTACT_DETAILS_REQUIRED`
 */
export async function requireContactDetails(context, tx, partyId) {
  if (context.tenant.isNapsoft) return;
  const person = await employee(tx, partyId);
  if (!isCompanyContact(person)) return;
  const details = await contactDetails(tx, partyId);
  if (
    !details.email ||
    (person.is_primary_contact && !details.phone) ||
    (person.is_billing_contact && !details.billingPhone)
  )
    throw new DirectoryError('CONTACT_DETAILS_REQUIRED');
}

/**
 * Require at least one primary contact and exactly one billing contact
 * (I0013-R010).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} tx
 * @returns {Promise<void>}
 * @throws {DirectoryError} `LAST_PRIMARY_CONTACT`, `BILLING_CONTACT`
 */
export async function requireContactCounts(context, tx) {
  if (context.tenant.isNapsoft) return;
  const counts = await tx.one(
    `SELECT count(*) FILTER (WHERE is_primary_contact)::int AS primaries,
            count(*) FILTER (WHERE is_billing_contact)::int AS billing
       FROM app.people
      WHERE tenant_id=$1 AND organization_id IS NULL AND deactivated_at IS NULL`,
    [context.tenant.id]
  );
  if (counts.primaries < 1) throw new DirectoryError('LAST_PRIMARY_CONTACT');
  if (counts.billing !== 1) throw new DirectoryError('BILLING_CONTACT');
}

/**
 * Queue Napsoft's copy of an employee who is, or was, a primary or billing
 * contact (I0013-R015). An archived or unflagged employee goes as a removal.
 * @param {import('./shared.js').DirectoryContext} context
 * @param {object} tx
 * @param {string} partyId
 * @param {boolean} wasContact Whether the employee was a contact before.
 * @returns {Promise<void>}
 */
export async function syncContact(context, tx, partyId, wasContact) {
  if (context.tenant.isNapsoft) return;
  const person = await employee(tx, partyId);
  if (!person) return;
  const active = isCompanyContact(person);
  if (!active && !wasContact) return;
  const details = await contactDetails(tx, partyId);
  await requestTenantContact(tx, {
    tenant_id: context.tenant.id,
    party_id: partyId,
    first_name: person.first_name,
    last_name: person.last_name,
    email: details.email,
    phone: details.phone,
    billing_phone: details.billingPhone,
    is_primary_contact: active && person.is_primary_contact,
    is_billing_contact: active && person.is_billing_contact,
  });
}

/**
 * The company profile a customer tenant sees (I0013-R026): its names, tax
 * ID status, and contacts.
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
    const people = await tx.any(
      `SELECT party_id, first_name, last_name, is_primary_contact,
              is_billing_contact, revision
         FROM app.people
        WHERE tenant_id=$1 AND organization_id IS NULL
          AND deactivated_at IS NULL
          AND (is_primary_contact OR is_billing_contact)
        ORDER BY last_name, first_name, party_id`,
      [context.tenant.id]
    );
    const contacts = [];
    for (const person of people) {
      const details = await contactDetails(tx, person.party_id);
      contacts.push({
        id: person.party_id,
        firstName: person.first_name,
        lastName: person.last_name,
        email: details.email,
        phone: details.phone,
        billingPhone: details.billingPhone,
        isPrimaryContact: person.is_primary_contact,
        isBillingContact: person.is_billing_contact,
        revision: person.revision,
      });
    }
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
      primaryContacts: contacts.filter(c => c.isPrimaryContact),
      billingContact: contacts.find(c => c.isBillingContact) ?? null,
    };
  });
}

const billingSchema = z.strictObject({ partyId: z.uuid() });

/**
 * Move the billing contact flag to another employee in one transaction
 * (I0013-R012).
 * @param {import('./shared.js').DirectoryContext} context
 * @param {unknown} body
 * @returns {Promise<object>} The company profile.
 * @throws {DirectoryError} `FORBIDDEN`, `INVALID_INPUT`, `NOT_FOUND`, `CONTACT_DETAILS_REQUIRED`
 */
export async function setBillingContact(context, body) {
  requireCustomerTenant(context);
  await requireCapability(context, COMPANY_PROFILE_WRITE);
  const { partyId } = parse(billingSchema, body);
  await mutate(context, async tx => {
    const target = await employee(tx, partyId);
    if (!target || target.deactivated_at) throw new DirectoryError('NOT_FOUND');
    const current = await tx.oneOrNone(
      `SELECT party_id FROM app.people
        WHERE tenant_id=$1 AND organization_id IS NULL
          AND deactivated_at IS NULL AND is_billing_contact
        FOR UPDATE`,
      [context.tenant.id]
    );
    if (current?.party_id === partyId) return { result: null };
    const set = (id, value) =>
      tx.none(
        `UPDATE app.people SET is_billing_contact=$2, revision=revision+1,
           updated_by=$3 WHERE party_id=$1`,
        [id, value, context.actorId]
      );
    if (current) await set(current.party_id, false);
    await set(partyId, true);
    await requireContactDetails(context, tx, partyId);
    if (current) await syncContact(context, tx, current.party_id, true);
    await syncContact(context, tx, partyId, isCompanyContact(target));
    return {
      result: null,
      changes: [
        {
          eventKey: 'directory.billing_contact.changed',
          recordId: partyId,
          details: { before: current?.party_id ?? null, after: partyId },
        },
      ],
    };
  });
  return getCompanyProfile(context);
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
 * Approve a tenant's pending tax ID (I0013-R022): set it on the Napsoft
 * client in the Napsoft tenant's format, and queue the decision for the
 * tenant. The value is decrypted for the tenant's row and encrypted again
 * for the client's.
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
    await context.cell.parties.setTaxId(id, columns, context.actorId, { tx });
    await requestTaxIdDecision(tx, {
      tenant_id: context.tenant.id,
      target_tenant_id: tenant.id,
      request_revision: request.revision,
      status: 'approved',
      reason: null,
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
