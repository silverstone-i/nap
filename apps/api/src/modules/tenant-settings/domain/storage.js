/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The tenant's storage connection (M0006-02-R001–R006). A connection
 * is saved only after a live test of the bucket, and its secret access key
 * is held only encrypted and never returned.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { storageChangeSchema } from '@nap/shared';
import { z } from 'zod';
import { SettingsError } from './errors.js';
import { failureReason } from './objectStore.js';
import { mutate, parse, read } from './shared.js';

const noQuery = z.strictObject({});
const disconnectQuery = z.strictObject({
  revision: z.coerce.number().int().positive(),
});

/** Connection fields in event order, by their column names. */
const FIELDS = [
  ['endpoint', 'endpoint'],
  ['region', 'region'],
  ['bucket', 'bucket'],
  ['accessKeyId', 'access_key_id'],
];

/**
 * Safe projection of the connection row: never the secret (R003).
 * @param {object|null} row
 * @returns {object|null}
 */
function storageView(row) {
  if (!row) return null;
  return {
    endpoint: row.endpoint,
    region: row.region,
    bucket: row.bucket,
    accessKeyId: row.access_key_id,
    secretSet: true,
    revision: row.revision,
  };
}

/**
 * The deployment's secret box, or `SERVICE_UNAVAILABLE` when the API was
 * built without the storage key.
 * @param {import('./shared.js').SettingsContext} context
 * @returns {{seal: Function, open: Function}}
 */
export function secretBox(context) {
  if (!context.secrets) throw new SettingsError('SERVICE_UNAVAILABLE');
  return context.secrets;
}

/**
 * Refuse a write made against a connection state the caller has not seen.
 * `null` means the caller saw no connection.
 * @param {object|null} row
 * @param {number|null} revision
 * @returns {void}
 * @throws {SettingsError} `STALE_REVISION`
 */
function requireRevision(row, revision) {
  if ((row?.revision ?? null) !== revision)
    throw new SettingsError('STALE_REVISION');
}

/**
 * Write, read back, and delete a small object (R004).
 * @param {import('./shared.js').SettingsContext} context
 * @param {object} connection
 * @returns {Promise<void>}
 * @throws {SettingsError} `STORAGE_TEST_FAILED` with its reason.
 */
async function testConnection(context, connection) {
  const key = `${context.tenant.id}/_connection-test/${randomUUID()}`;
  const body = randomBytes(32);
  let same;
  try {
    const store = context.objectStores(connection);
    await store.put(key, body, 'application/octet-stream');
    same = (await store.get(key)).equals(body);
    await store.delete(key);
  } catch (error) {
    throw new SettingsError('STORAGE_TEST_FAILED', failureReason(error));
  }
  if (!same)
    throw new SettingsError('STORAGE_TEST_FAILED', 'UNEXPECTED_RESPONSE');
}

/**
 * The connection without its secret, or `null` (R003, §10).
 * @param {import('./shared.js').SettingsContext} context
 * @param {object} query
 * @returns {Promise<object|null>}
 */
export function getStorage(context, query) {
  parse(noQuery, query);
  return read(context, async tx =>
    storageView(
      await context.cell.file_storage.byTenant(context.tenant.id, { tx })
    )
  );
}

/**
 * Connect or change the storage connection (R001, R002, R004, R005). Left
 * out, the secret is kept, but only while the endpoint and access key ID
 * are unchanged. The test runs before the row is locked, so a slow bucket
 * never holds a transaction open; the revision is checked again after.
 * @param {import('./shared.js').SettingsContext} context
 * @param {unknown} body
 * @returns {Promise<object>}
 */
export async function saveStorage(context, body) {
  const input = parse(storageChangeSchema, body);
  const box = secretBox(context);
  const tenantId = context.tenant.id;
  const current = await read(context, tx =>
    context.cell.file_storage.byTenant(tenantId, { tx })
  );
  requireRevision(current, input.revision);
  let secret = input.secretAccessKey;
  if (secret === undefined) {
    if (
      !current ||
      current.endpoint !== input.endpoint ||
      current.access_key_id !== input.accessKeyId
    )
      throw new SettingsError('INVALID_INPUT');
    try {
      secret = box.open(current.secret_encrypted, tenantId);
    } catch {
      throw new SettingsError('STORAGE_UNAVAILABLE');
    }
  }
  const connection = {
    endpoint: input.endpoint,
    region: input.region,
    bucket: input.bucket,
    accessKeyId: input.accessKeyId,
    secretAccessKey: secret,
  };
  await testConnection(context, connection);
  return mutate(context, async tx => {
    const locked = await context.cell.file_storage.byTenant(tenantId, {
      tx,
      lock: true,
    });
    requireRevision(locked, input.revision);
    const row = {
      tenant_id: tenantId,
      endpoint: input.endpoint,
      region: input.region,
      bucket: input.bucket,
      access_key_id: input.accessKeyId,
      secret_encrypted: box.seal(secret, tenantId),
    };
    const changed = FIELDS.filter(
      ([field, column]) => !locked || locked[column] !== input[field]
    ).map(([, column]) => column);
    if (input.secretAccessKey !== undefined) changed.push('secret_access_key');
    const saved = locked
      ? await context.cell.file_storage.change(row, context.actorId, { tx })
      : await context.cell.file_storage.connect(row, context.actorId, { tx });
    return {
      result: storageView(saved),
      changes: [
        {
          eventKey: locked
            ? 'tenant_settings.storage_changed'
            : 'tenant_settings.storage_connected',
          details: {
            changed_fields: changed.join(','),
            revision: saved.revision,
          },
        },
      ],
    };
  });
}

/**
 * Disconnect storage (R006). Files stay in the bucket and their rows stay,
 * so reconnecting the same bucket brings them back.
 * @param {import('./shared.js').SettingsContext} context
 * @param {object} query `{ revision }`
 * @returns {Promise<null>}
 */
export function deleteStorage(context, query) {
  const { revision } = parse(disconnectQuery, query);
  return mutate(context, async tx => {
    const locked = await context.cell.file_storage.byTenant(context.tenant.id, {
      tx,
      lock: true,
    });
    requireRevision(locked, revision);
    await context.cell.file_storage.disconnect(context.tenant.id, { tx });
    return {
      result: null,
      changes: [
        {
          eventKey: 'tenant_settings.storage_disconnected',
          details: { changed_fields: '', revision },
        },
      ],
    };
  });
}
