/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { applyPortalAccess } from '../../modules/admin-tenancy/domain/accounts.js';
import { SyncFailure } from './engine.js';
import { parseSnapshot } from './snapshots.js';

/** The cell copy each admin topic writes. */
const COPIES = Object.freeze({
  tenant: 'tenants',
  membership: 'tenant_members',
  entitlement: 'module_entitlements',
});

/**
 * Split rows into parsed snapshots and `INVALID_PAYLOAD` failures.
 * @param {object[]} rows
 * @returns {{valid: {row: object, snapshot: object}[], failed: {id: string, code: string}[]}}
 */
function parseRows(rows) {
  const valid = [];
  const failed = [];
  for (const row of rows) {
    const snapshot = parseSnapshot(row.topic, row.payload);
    if (snapshot) valid.push({ row, snapshot });
    else failed.push({ id: row.id, code: 'INVALID_PAYLOAD' });
  }
  return { valid, failed };
}

/**
 * Build the admin-to-cell apply step for one tenant (I0004-R014–R018).
 * The target cell comes from `admin.tenants.cell_id` at delivery time and
 * its connection from the registry, never from the outbox row.
 * @param {{admin: object, registry: {dbFor: (id: string) => object}, tenantId: string}} options
 * @returns {(rows: object[]) => Promise<{delivered: string[], failed: {id: string, code: string}[]}>}
 */
export function adminToCell({ admin, registry, tenantId }) {
  return async rows => {
    const cellId = await admin.tenants.cellOf(tenantId);
    if (!cellId) throw new SyncFailure('CELL_NOT_ASSIGNED');
    let cell;
    try {
      cell = registry.dbFor(cellId);
    } catch {
      throw new SyncFailure('CELL_UNAVAILABLE');
    }
    const { valid, failed } = parseRows(rows);
    await cell.tx(async tx => {
      // The copy cannot disappear inside this transaction, so check once.
      let tenantSynced = false;
      for (const { row, snapshot } of valid) {
        if (row.topic !== 'tenant' && !tenantSynced) {
          if (!(await cell.tenants.exists(tenantId, { tx })))
            throw new SyncFailure('TENANT_NOT_SYNCED');
          tenantSynced = true;
        }
        await cell[COPIES[row.topic]].applySnapshot(
          snapshot,
          row.revision,
          row.created_by ?? null,
          { tx }
        );
        if (row.topic === 'tenant') tenantSynced = true;
      }
    });
    return { delivered: valid.map(({ row }) => row.id), failed };
  };
}

/**
 * Build the cell-to-admin apply step for one tenant's portal-access requests
 * (I0004-R024–R030). The tenant is the source row's, and it must be one the
 * source cell holds; a payload naming another tenant fails that row.
 * @param {{admin: object, cellId: string, tenantId: string}} options
 * @returns {(rows: object[]) => Promise<{delivered: string[], failed: {id: string, code: string}[]}>}
 */
export function cellToAdmin({ admin, cellId, tenantId }) {
  const direction = 'cell_to_admin';
  return async rows => {
    const assigned = await admin.tenants.cellOf(tenantId);
    const ownsTenant =
      assigned && String(assigned).toLowerCase() === cellId.toLowerCase();
    const delivered = [];
    const failed = [];
    await admin.tx(async tx => {
      const event = (row, eventKey, details) =>
        admin.managed_events.append(
          {
            deduplication_key: randomUUID(),
            event_key: eventKey,
            outcome: eventKey.endsWith('.failed') ? 'failed' : 'succeeded',
            tenant_id: tenantId,
            target_type: 'outbox',
            target_id: row.entity_id,
            details: { direction, ...details },
          },
          { tx }
        );
      const fail = async (row, code) => {
        failed.push({ id: row.id, code });
        await event(row, 'portal_access.failed', { failure_code: code });
      };
      for (const row of rows) {
        const snapshot = parseSnapshot(row.topic, row.payload);
        if (!snapshot) {
          await fail(row, 'INVALID_PAYLOAD');
          continue;
        }
        if (!ownsTenant || snapshot.tenant_id !== tenantId) {
          await fail(row, 'TENANT_MISMATCH');
          continue;
        }
        const result = await applyPortalAccess(
          admin,
          { tenantId, payload: snapshot },
          { tx }
        );
        if (result.failureCode) {
          await fail(row, result.failureCode);
          continue;
        }
        delivered.push(row.id);
        await event(row, 'portal_access.applied', {
          invitation_pending: result.invitationPending,
        });
      }
    });
    return { delivered, failed };
  };
}
