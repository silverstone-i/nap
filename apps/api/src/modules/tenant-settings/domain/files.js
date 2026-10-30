/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Files nap stores in the tenant's bucket (M0006-02-R007–R012) and
 * the tenant logo (R013). The API checks each upload's content, names its
 * object, and writes it; the browser never writes to the bucket and reads
 * only through short-lived signed links.
 */

import { randomUUID } from 'node:crypto';
import { MAX_FILE_BYTES } from '@nap/shared';
import { z } from 'zod';
import { SettingsError } from './errors.js';
import { LINK_SECONDS } from './objectStore.js';
import { mutate, parse, read } from './shared.js';
import { secretBox } from './storage.js';

const linkParams = z.strictObject({ id: z.string().uuid() });
const noQuery = z.strictObject({});

/**
 * The image type a file's first bytes show, or null for anything else
 * (R008). The declared type is never trusted alone.
 * @param {Buffer} buffer
 * @returns {'image/png'|'image/jpeg'|'image/webp'|'image/gif'|null}
 */
export function contentTypeOf(buffer) {
  const starts = (bytes, at = 0) =>
    buffer.length >= at + bytes.length &&
    buffer.subarray(at, at + bytes.length).equals(Buffer.from(bytes));
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'image/png';
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([...'GIF87a'].map(c => c.charCodeAt(0)))) return 'image/gif';
  if (starts([...'GIF89a'].map(c => c.charCodeAt(0)))) return 'image/gif';
  if (
    starts([...'RIFF'].map(c => c.charCodeAt(0))) &&
    starts(
      [...'WEBP'].map(c => c.charCodeAt(0)),
      8
    )
  )
    return 'image/webp';
  return null;
}

/**
 * Check an upload against R007 and R008: a non-empty image of at most
 * 2 MB whose content matches its declared type.
 * @param {{buffer: Buffer, declaredType: string, truncated: boolean} | undefined} upload
 * @returns {string} The content type.
 * @throws {SettingsError} `INVALID_INPUT`
 */
export function imageType(upload) {
  if (
    !upload ||
    upload.truncated ||
    upload.buffer.length === 0 ||
    upload.buffer.length > MAX_FILE_BYTES
  )
    throw new SettingsError('INVALID_INPUT');
  const type = contentTypeOf(upload.buffer);
  if (!type || type !== upload.declaredType)
    throw new SettingsError('INVALID_INPUT');
  return type;
}

/**
 * The tenant's bucket, from its saved connection (R012).
 * @param {import('./shared.js').SettingsContext} context
 * @param {object} tx
 * @returns {Promise<object>} An object store.
 * @throws {SettingsError} `STORAGE_NOT_CONFIGURED` or `STORAGE_UNAVAILABLE`.
 */
export async function openStore(context, tx) {
  const row = await context.cell.file_storage.byTenant(context.tenant.id, {
    tx,
  });
  if (!row) throw new SettingsError('STORAGE_NOT_CONFIGURED');
  const box = secretBox(context);
  try {
    return context.objectStores({
      endpoint: row.endpoint,
      region: row.region,
      bucket: row.bucket,
      accessKeyId: row.access_key_id,
      secretAccessKey: box.open(row.secret_encrypted, context.tenant.id),
    });
  } catch {
    throw new SettingsError('STORAGE_UNAVAILABLE');
  }
}

/**
 * Delete an object whose file was replaced or removed (R011). A failure
 * never fails the change: it is logged with the key for later cleanup.
 * @param {object|null} store
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function discardObject(store, key) {
  try {
    if (!store) throw new Error('storage unavailable');
    await store.delete(key);
  } catch {
    console.warn(
      JSON.stringify({ event: 'file.delete_failed', object_key: key })
    );
  }
}

/**
 * A signed link to one stored file, valid for 15 minutes (R010).
 * @param {import('./shared.js').SettingsContext} context
 * @param {object} params `{ id }`
 * @param {object} query
 * @returns {Promise<{url: string, expiresAt: string}>}
 */
export function fileLink(context, params, query) {
  const { id } = parse(linkParams, params);
  parse(noQuery, query);
  return read(context, async tx => {
    const file = await context.cell.files.activeById(id, { tx });
    if (!file) throw new SettingsError('NOT_FOUND');
    const store = await openStore(context, tx);
    const expiresAt = new Date(Date.now() + LINK_SECONDS * 1000);
    let url;
    try {
      url = await store.signedGetUrl(file.object_key, LINK_SECONDS);
    } catch {
      throw new SettingsError('STORAGE_UNAVAILABLE');
    }
    return { url, expiresAt: expiresAt.toISOString() };
  });
}

/**
 * Check an upload and write it to the tenant's bucket under a key nap names,
 * `<tenant_id>/<purpose>/<file_id>` (R007–R009). The caller records the
 * returned row in its own transaction, and discards the object if that
 * transaction fails.
 * @param {import('./shared.js').SettingsContext} context
 * @param {'logo_light'|'logo_dark'|'profile_image'} purpose
 * @param {{buffer: Buffer, declaredType: string, truncated: boolean} | undefined} upload
 * @returns {Promise<{store: object, file: object}>}
 * @throws {SettingsError} `INVALID_INPUT`, `STORAGE_NOT_CONFIGURED`, or `STORAGE_UNAVAILABLE`.
 */
export async function storeImage(context, purpose, upload) {
  const contentType = imageType(upload);
  const tenantId = context.tenant.id;
  const store = await read(context, tx => openStore(context, tx));
  const id = randomUUID();
  const file = {
    id,
    tenant_id: tenantId,
    purpose,
    object_key: `${tenantId}/${purpose}/${id}`,
    content_type: contentType,
    size_bytes: upload.buffer.length,
  };
  try {
    await store.put(file.object_key, upload.buffer, contentType);
  } catch {
    throw new SettingsError('STORAGE_UNAVAILABLE');
  }
  return { store, file };
}

/**
 * Delete the object of a file already archived, opening the bucket only to
 * do so (R011). With no storage, or storage failing, the key is logged.
 * @param {import('./shared.js').SettingsContext} context
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function discardArchived(context, key) {
  const store = await read(context, tx => openStore(context, tx)).catch(
    () => null
  );
  await discardObject(store, key);
}

/** Logo variants (M0006-04): the light-theme and the dark-theme logo. */
export const LOGO_VARIANTS = ['light', 'dark'];

/**
 * @param {string} variant A route's `:variant`.
 * @returns {'light'|'dark'}
 * @throws {SettingsError} `NOT_FOUND` for any other value (M0006-04 §10).
 */
function logoVariant(variant) {
  if (!LOGO_VARIANTS.includes(variant)) throw new SettingsError('NOT_FOUND');
  return /** @type {'light'|'dark'} */ (variant);
}

/**
 * Upload or replace one tenant logo (R008, R009, R011, R013; M0006-04-R003).
 * The object is written before the row, and deleted again if the row cannot
 * be saved; the replaced logo's object is deleted after the change commits.
 * @param {import('./shared.js').SettingsContext} context
 * @param {string} variant `light` or `dark`.
 * @param {{buffer: Buffer, declaredType: string, truncated: boolean} | undefined} upload
 * @returns {Promise<{logoFileId: string}>}
 */
export async function putLogo(context, variant, upload) {
  const which = logoVariant(variant);
  const { store, file } = await storeImage(context, `logo_${which}`, upload);
  let previous;
  try {
    previous = await mutate(context, async tx => {
      const old = await context.cell.files.activeLogo(which, {
        tx,
        lock: true,
      });
      if (old)
        await context.cell.files.archive(old.id, context.actorId, { tx });
      await context.cell.files.record(file, context.actorId, { tx });
      return {
        result: old,
        changes: [
          {
            eventKey: 'tenant_settings.logo_changed',
            details: {
              action: old ? 'replaced' : 'uploaded',
              variant: which,
              file_id: file.id,
            },
          },
        ],
      };
    });
  } catch (error) {
    await discardObject(store, file.object_key);
    throw error;
  }
  if (previous) await discardObject(store, previous.object_key);
  return { logoFileId: file.id };
}

/**
 * Remove one tenant logo (R011, R013; M0006-04-R003). The row is archived
 * even when the bucket cannot be reached; the object is then logged for
 * cleanup.
 * @param {import('./shared.js').SettingsContext} context
 * @param {string} variant `light` or `dark`.
 * @returns {Promise<null>}
 */
export async function deleteLogo(context, variant) {
  const which = logoVariant(variant);
  const removed = await mutate(context, async tx => {
    const old = await context.cell.files.activeLogo(which, { tx, lock: true });
    if (!old) throw new SettingsError('NOT_FOUND');
    await context.cell.files.archive(old.id, context.actorId, { tx });
    return {
      result: old,
      changes: [
        {
          eventKey: 'tenant_settings.logo_changed',
          details: { action: 'removed', variant: which, file_id: old.id },
        },
      ],
    };
  });
  await discardArchived(context, removed.object_key);
  return null;
}
