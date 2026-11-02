/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Applying a customer tenant's company profile rows in the admin
 * database (I0013): Napsoft's copy of the tenant's contacts, the tenant's
 * names, and tax ID requests and decisions. The sync worker calls these
 * inside its admin transaction; each returns a final failure code, or
 * `null` when the row is applied.
 */

/**
 * Display name: the DBA name when set, otherwise the legal name
 * (I0013 §5).
 * @param {string} legalName
 * @param {string|null} dbaName
 * @returns {string}
 */
export function displayName(legalName, dbaName) {
  return dbaName ?? legalName;
}

/**
 * A tenant's `is_napsoft` flag, or `null` for an unknown tenant.
 * @param {string} tenantId
 * @param {{tx: object}} options
 * @returns {Promise<boolean|null>}
 */
async function napsoftFlag(tenantId, { tx }) {
  const row = await tx.oneOrNone(
    'SELECT is_napsoft FROM admin.tenants WHERE id=$1',
    [tenantId]
  );
  return row ? row.is_napsoft : null;
}

/**
 * Whether the approval names the tenant's own Napsoft client (R022).
 * @param {string} tenantId
 * @param {string} clientId
 * @param {{tx: object}} options
 * @returns {Promise<boolean>}
 */
async function isTenantClient(tenantId, clientId, { tx }) {
  const tenant = await tx.oneOrNone(
    'SELECT client_id FROM admin.tenants WHERE id=$1',
    [tenantId]
  );
  return tenant?.client_id === clientId;
}

/**
 * Queue an admin outbox row for a tenant's cell at the entity's next
 * revision.
 * @param {object} admin
 * @param {object} tx
 * @param {{tenantId: string, topic: string, entityId: string, payload: object, actor: string|null}} row
 * @returns {Promise<void>}
 */
async function queue(admin, tx, { tenantId, topic, entityId, payload, actor }) {
  await tx.one('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `admin.outbox|${topic}|${entityId}`,
  ]);
  const revision = await admin.outbox.nextRevision(topic, entityId, { tx });
  await admin.outbox.insert(
    {
      tenant_id: tenantId,
      topic,
      entity_id: entityId,
      revision,
      payload,
      created_by: actor,
      updated_by: actor,
    },
    { tx }
  );
}

/**
 * Upsert or remove one contact in `admin.tenant_contacts` (I0013-R016). A
 * row only replaces an older revision.
 * @param {object} admin
 * @param {{revision: number, created_by?: string|null}} row
 * @param {object} snapshot `tenant_contact` payload.
 * @param {{tx: object}} options
 * @returns {Promise<null>}
 */
export async function applyTenantContact(admin, row, snapshot, { tx }) {
  const current = await tx.oneOrNone(
    'SELECT revision FROM admin.tenant_contacts WHERE tenant_id=$1 AND party_id=$2 FOR UPDATE',
    [snapshot.tenant_id, snapshot.party_id]
  );
  if (current && current.revision >= row.revision) return null;
  if (!snapshot.is_primary_contact && !snapshot.is_billing_contact) {
    await tx.none(
      'DELETE FROM admin.tenant_contacts WHERE tenant_id=$1 AND party_id=$2',
      [snapshot.tenant_id, snapshot.party_id]
    );
    return null;
  }
  const actor = row.created_by ?? null;
  await tx.none(
    `INSERT INTO admin.tenant_contacts
       (tenant_id, party_id, first_name, last_name, email, phone,
        billing_phone, is_primary_contact, is_billing_contact, revision,
        created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
     ON CONFLICT (tenant_id, party_id) DO UPDATE SET
       first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
       email=EXCLUDED.email, phone=EXCLUDED.phone,
       billing_phone=EXCLUDED.billing_phone,
       is_primary_contact=EXCLUDED.is_primary_contact,
       is_billing_contact=EXCLUDED.is_billing_contact,
       revision=EXCLUDED.revision, updated_by=EXCLUDED.updated_by`,
    [
      snapshot.tenant_id,
      snapshot.party_id,
      snapshot.first_name,
      snapshot.last_name,
      snapshot.email,
      snapshot.phone,
      snapshot.billing_phone,
      snapshot.is_primary_contact,
      snapshot.is_billing_contact,
      row.revision,
      actor,
    ]
  );
  return null;
}

/**
 * Apply a Napsoft client rename to its tenant (I0013-R007). The tenant's
 * revisioned row then carries the names to its cell.
 * @param {object} admin
 * @param {string} sourceTenantId The tenant whose cell wrote the row.
 * @param {{created_by?: string|null}} row
 * @param {object} snapshot `client_name` payload.
 * @param {{tx: object}} options
 * @returns {Promise<string|null>} `TENANT_MISMATCH` unless Napsoft renames
 *   a customer tenant.
 */
export async function applyClientName(
  admin,
  sourceTenantId,
  row,
  snapshot,
  { tx }
) {
  if (
    (await napsoftFlag(sourceTenantId, { tx })) !== true ||
    (await napsoftFlag(snapshot.target_tenant_id, { tx })) !== false
  )
    return 'TENANT_MISMATCH';
  await admin.tenants.update(
    snapshot.target_tenant_id,
    {
      legal_name: snapshot.legal_name,
      dba_name: snapshot.dba_name,
      name: displayName(snapshot.legal_name, snapshot.dba_name),
    },
    { tx, actorId: row.created_by ?? null }
  );
  return null;
}

/**
 * Record a tenant's tax ID submission as pending (I0013-R020). A row only
 * replaces an older request.
 * @param {object} admin
 * @param {{revision: number, created_by?: string|null}} row
 * @param {object} snapshot `tax_id_request` payload.
 * @param {{tx: object}} options
 * @returns {Promise<string|null>} `TENANT_MISMATCH` for the Napsoft tenant.
 */
export async function applyTaxIdRequest(admin, row, snapshot, { tx }) {
  if ((await napsoftFlag(snapshot.tenant_id, { tx })) !== false)
    return 'TENANT_MISMATCH';
  const actor = row.created_by ?? null;
  await tx.none(
    `INSERT INTO admin.tenant_tax_id_requests
       (tenant_id, tax_id_encrypted, tax_id_last4, country, status, reason,
        revision, created_by, updated_by)
     VALUES ($1,$2,$3,$4,'pending',NULL,$5,$6,$6)
     ON CONFLICT (tenant_id) DO UPDATE SET
       tax_id_encrypted=EXCLUDED.tax_id_encrypted,
       tax_id_last4=EXCLUDED.tax_id_last4, country=EXCLUDED.country,
       status='pending', reason=NULL, revision=EXCLUDED.revision,
       updated_by=EXCLUDED.updated_by
     WHERE admin.tenant_tax_id_requests.revision < EXCLUDED.revision`,
    [
      snapshot.tenant_id,
      snapshot.tax_id_encrypted,
      snapshot.tax_id_last4,
      snapshot.country,
      row.revision,
      actor,
    ]
  );
  return null;
}

/**
 * Apply Napsoft's decision on a tenant's pending request and queue it for
 * the tenant's cell (I0013-R024).
 * @param {object} admin
 * @param {string} sourceTenantId The tenant whose cell wrote the row.
 * @param {{created_by?: string|null}} row
 * @param {object} snapshot `tax_id_decision` payload with `target_tenant_id`.
 * @param {{tx: object}} options
 * @returns {Promise<string|null>} `TENANT_MISMATCH` unless Napsoft decides
 *   for a customer tenant and, for an approval, names its client;
 *   `REQUEST_SUPERSEDED` when the decided request is no longer the pending
 *   one. A decision already applied returns `null` and changes nothing.
 */
export async function applyTaxIdDecision(
  admin,
  sourceTenantId,
  row,
  snapshot,
  { tx }
) {
  const target = snapshot.target_tenant_id;
  if (
    !target ||
    (await napsoftFlag(sourceTenantId, { tx })) !== true ||
    (await napsoftFlag(target, { tx })) !== false ||
    (snapshot.client_id &&
      !(await isTenantClient(target, snapshot.client_id, { tx })))
  )
    return 'TENANT_MISMATCH';
  const request = await tx.oneOrNone(
    'SELECT revision, status FROM admin.tenant_tax_id_requests WHERE tenant_id=$1 FOR UPDATE',
    [target]
  );
  // A redelivery of a decision already applied changes nothing.
  if (
    request?.revision === snapshot.request_revision &&
    request.status === snapshot.status
  )
    return null;
  if (
    !request ||
    request.status !== 'pending' ||
    request.revision !== snapshot.request_revision
  )
    return 'REQUEST_SUPERSEDED';
  const actor = row.created_by ?? null;
  await tx.none(
    'UPDATE admin.tenant_tax_id_requests SET status=$2, reason=$3, updated_by=$4 WHERE tenant_id=$1',
    [target, snapshot.status, snapshot.reason, actor]
  );
  await queue(admin, tx, {
    tenantId: target,
    topic: 'tax_id_decision',
    entityId: target,
    payload: {
      tenant_id: target,
      request_revision: snapshot.request_revision,
      status: snapshot.status,
      reason: snapshot.reason,
      // The client's tax ID rides along; the tenant's cell returns it with
      // `tax_id_applied` once it has applied the approval.
      ...(snapshot.status === 'approved' &&
        snapshot.client_id &&
        snapshot.client_tax_id && {
          client_id: snapshot.client_id,
          client_tax_id: snapshot.client_tax_id,
        }),
    },
    actor,
  });
  return null;
}

/**
 * The tenant's cell applied Napsoft's approval (I0013-R024): give the tax
 * ID to the tenant's Napsoft client. The value is now the tenant's
 * approved tax ID, so the client takes it even if the tenant has since
 * submitted another request, which is only pending. A redelivery queues the
 * same value again.
 * @param {object} admin
 * @param {string} sourceTenantId The tenant whose cell wrote the row.
 * @param {{created_by?: string|null}} row
 * @param {object} snapshot `tax_id_applied` payload.
 * @param {{tx: object}} options
 * @returns {Promise<string|null>} `TENANT_MISMATCH` unless a customer tenant
 *   confirms for its own client.
 */
export async function applyTaxIdApplied(
  admin,
  sourceTenantId,
  row,
  snapshot,
  { tx }
) {
  if (
    (await napsoftFlag(sourceTenantId, { tx })) !== false ||
    !(await isTenantClient(sourceTenantId, snapshot.client_id, { tx }))
  )
    return 'TENANT_MISMATCH';
  const napsoft = await tx.one('SELECT id FROM admin.tenants WHERE is_napsoft');
  await queue(admin, tx, {
    tenantId: napsoft.id,
    topic: 'client_tax_id',
    entityId: snapshot.client_id,
    payload: {
      tenant_id: napsoft.id,
      client_id: snapshot.client_id,
      ...snapshot.client_tax_id,
    },
    actor: row.created_by ?? null,
  });
  return null;
}

/**
 * Napsoft's copy of a tenant's primary and billing contacts (I0013-R017).
 * @param {object} admin
 * @param {unknown} tenantId
 * @returns {Promise<object[]>} Empty for an unknown tenant.
 */
export async function listTenantContacts(admin, tenantId) {
  if (typeof tenantId !== 'string' || !UUID.test(tenantId)) return [];
  const rows = await admin.tenant_contacts.findWhere(
    { tenant_id: tenantId },
    'AND',
    { orderBy: ['last_name', 'first_name', 'party_id'] }
  );
  return rows.map(row => ({
    id: row.party_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    billingPhone: row.billing_phone ?? null,
    isPrimaryContact: row.is_primary_contact,
    isBillingContact: row.is_billing_contact,
  }));
}

/**
 * A tenant's latest tax ID request, with only its last four digits
 * (I0013-R029).
 * @param {object} admin
 * @param {unknown} tenantId
 * @returns {Promise<object|null>}
 */
export async function tenantTaxIdRequest(admin, tenantId) {
  if (typeof tenantId !== 'string' || !UUID.test(tenantId)) return null;
  const row = await admin.tenant_tax_id_requests.findOneBy({
    tenant_id: tenantId,
  });
  if (!row) return null;
  return {
    last4: row.tax_id_last4.trim(),
    country: row.country,
    status: row.status,
    reason: row.reason ?? null,
    revision: row.revision,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
