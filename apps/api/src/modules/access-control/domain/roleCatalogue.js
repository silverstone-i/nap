/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { SYSTEM_ROLE_DEFINITIONS } from '../../../capability/systemRoles.js';
import { validateCapability } from '../../../capability/index.js';

export class RoleCatalogueError extends Error {
  constructor(code, cause) {
    super(code, cause ? { cause } : undefined);
    this.code = code;
  }
}

function normalizeCapabilities(value) {
  if (!Array.isArray(value)) throw new RoleCatalogueError('ROLE_DRIFT');
  let capabilities;
  try {
    capabilities = value.map(capability =>
      validateCapability(capability, { allowWildcard: true })
    );
  } catch {
    throw new RoleCatalogueError('ROLE_DRIFT');
  }
  return [...new Set(capabilities)].sort();
}

function sameCapabilities(left, right) {
  return JSON.stringify(normalizeCapabilities(left)) === JSON.stringify(right);
}

async function tenantTransaction(handle, tenantId, operation) {
  try {
    return await handle.db.tx(async tx => {
      await tx.one("SELECT set_config('nap.tenant_id',$1,true)", [tenantId]);
      return operation(tx);
    });
  } catch (error) {
    if (error instanceof RoleCatalogueError) throw error;
    throw new RoleCatalogueError('SERVICE_UNAVAILABLE', error);
  }
}

async function seedDefinition(tx, tenantId, systemRole) {
  const definition = SYSTEM_ROLE_DEFINITIONS[systemRole];
  const expected = normalizeCapabilities(definition.capabilities);
  const existing = await tx.oneOrNone(
    `SELECT id,code,name,system_role,capabilities,deactivated_at
       FROM app.roles
      WHERE tenant_id=$1 AND (system_role=$2 OR code=$2)
      ORDER BY system_role NULLS LAST LIMIT 1 FOR UPDATE`,
    [tenantId, systemRole]
  );
  if (!existing)
    return tx.one(
      `INSERT INTO app.roles(tenant_id,code,name,system_role,capabilities)
       VALUES($1,$2,$3,$2,$4::jsonb)
       RETURNING id,tenant_id,code,name,system_role,capabilities`,
      [tenantId, definition.code, definition.name, JSON.stringify(expected)]
    );
  if (
    existing.code !== definition.code ||
    existing.system_role !== systemRole ||
    existing.name !== definition.name ||
    !sameCapabilities(existing.capabilities, expected)
  )
    throw new RoleCatalogueError('ROLE_DRIFT');
  if (existing.deactivated_at)
    return tx.one(
      `UPDATE app.roles SET deactivated_at=NULL,updated_at=now()
        WHERE id=$1
        RETURNING id,tenant_id,code,name,system_role,capabilities`,
      [existing.id]
    );
  return { ...existing, tenant_id: tenantId };
}

export function seedTenantRoles(handle, tenantId) {
  return tenantTransaction(handle, tenantId, tx =>
    seedDefinition(tx, tenantId, 'tenant_admin')
  );
}

export function seedOwnerRoles(handle, tenantId) {
  return tenantTransaction(handle, tenantId, async tx => [
    await seedDefinition(tx, tenantId, 'platform_admin'),
    await seedDefinition(tx, tenantId, 'support'),
  ]);
}

export function listTenantRoles(handle, tenantId) {
  return tenantTransaction(handle, tenantId, tx =>
    tx.any(
      `SELECT id,tenant_id AS tenant,code,name,system_role AS "systemRole",capabilities
         FROM app.roles
        WHERE tenant_id=$1 AND deactivated_at IS NULL
        ORDER BY code,id`,
      [tenantId]
    )
  );
}

export function resolveTenantRoles(handle, tenantId, roleIds) {
  if (!Array.isArray(roleIds) || roleIds.length === 0)
    return Promise.resolve([]);
  return tenantTransaction(handle, tenantId, async tx => {
    const rows = await tx.any(
      `SELECT id,tenant_id AS tenant,code,name,system_role AS "systemRole",capabilities
         FROM app.roles
        WHERE tenant_id=$1 AND id IN ($2:csv) AND deactivated_at IS NULL`,
      [tenantId, roleIds]
    );
    return rows.filter(row => {
      try {
        row.capabilities = normalizeCapabilities(row.capabilities);
        return true;
      } catch {
        return false;
      }
    });
  });
}
