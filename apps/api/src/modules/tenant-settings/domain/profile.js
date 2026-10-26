/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The signed-in member's profile in the selected tenant (M0006-03):
 * overrides of overridable general settings and a profile image. The
 * member always comes from the session, never from the request (§7), so no
 * route can read or change another member's profile. Profile changes write
 * no administrative event (§12).
 */

import {
  effectiveGeneralSettings,
  OVERRIDABLE_SETTINGS,
  profileChangeSchema,
  validOverrides,
} from '@nap/shared';
import { z } from 'zod';
import { SettingsError } from './errors.js';
import { discardArchived, discardObject, storeImage } from './files.js';
import { mutate, parse, read } from './shared.js';

const noQuery = z.strictObject({});

/**
 * Safe projection of a profile row, with the tenant's value of each
 * overridable setting beside it (R006); before the member saves a profile,
 * an empty one at revision 0 (§10).
 * @param {object|null} row
 * @param {Record<string, unknown>} stored The tenant's stored settings.
 * @returns {object}
 */
function profileView(row, stored) {
  const tenant = effectiveGeneralSettings(stored);
  return {
    overrides: validOverrides(row?.overrides ?? {}),
    tenantValues: Object.fromEntries(
      OVERRIDABLE_SETTINGS.map(name => [name, tenant[name]])
    ),
    defaultImage: row?.default_image ?? null,
    imageFileId: row?.image_file_id ?? null,
    revision: row?.revision ?? 0,
  };
}

/**
 * The tenant's stored general settings, inside the caller's transaction.
 * @param {import('./shared.js').SettingsContext} context
 * @param {object} tx
 * @returns {Promise<Record<string, unknown>>}
 */
async function tenantSettings(context, tx) {
  const row = await context.cell.tenant_settings.byTenant(context.tenant.id, {
    tx,
  });
  return row?.settings ?? {};
}

/**
 * The membership the session acts as in the selected tenant, when it is
 * active, or null (I0012: a login that is two parties has two profiles).
 * @param {import('./shared.js').SettingsContext} context
 * @param {object} tx
 * @returns {Promise<{id: string}|null>}
 */
async function membership(context, tx) {
  if (!context.membershipId) return null;
  const member = await context.cell.tenant_members.byId(
    context.tenant.id,
    context.membershipId,
    { tx }
  );
  return member?.status === 'active' ? member : null;
}

/**
 * The member's profile row, or null, inside the caller's transaction. Used
 * by `GET /effective` to apply the member's overrides and image (R003).
 * @param {import('./shared.js').SettingsContext} context
 * @param {object} tx
 * @returns {Promise<object|null>}
 */
export async function memberProfile(context, tx) {
  const member = await membership(context, tx);
  return member
    ? context.cell.member_profiles.byMembership(member.id, { tx })
    : null;
}

/**
 * Lock the member's profile for a change, refusing a non-member.
 * @param {import('./shared.js').SettingsContext} context
 * @param {object} tx
 * @returns {Promise<{member: {id: string}, row: object|null}>}
 * @throws {SettingsError} `FORBIDDEN`
 */
async function lockProfile(context, tx) {
  const member = await membership(context, tx);
  if (!member) throw new SettingsError('FORBIDDEN');
  const row = await context.cell.member_profiles.byMembership(member.id, {
    tx,
    lock: true,
  });
  return { member, row };
}

/**
 * Save the profile with `changes` laid over its current values.
 * @param {import('./shared.js').SettingsContext} context
 * @param {{member: {id: string}, row: object|null}} locked
 * @param {object} changes Column values to replace.
 * @param {object} tx
 * @returns {Promise<object>} The saved row.
 */
function saveProfile(context, { member, row }, changes, tx) {
  return context.cell.member_profiles.save(
    {
      membership_id: member.id,
      tenant_id: context.tenant.id,
      overrides: validOverrides(row?.overrides ?? {}),
      default_image: row?.default_image ?? null,
      image_file_id: row?.image_file_id ?? null,
      ...changes,
    },
    context.actorId,
    { tx }
  );
}

/**
 * Archive the uploaded image a profile no longer uses, returning its object
 * key for deletion once the change commits (R005).
 * @param {import('./shared.js').SettingsContext} context
 * @param {string|null} fileId
 * @param {object} tx
 * @returns {Promise<string|null>}
 */
async function archiveImage(context, fileId, tx) {
  if (!fileId) return null;
  const file = await context.cell.files.activeById(fileId, { tx });
  if (!file) return null;
  await context.cell.files.archive(file.id, context.actorId, { tx });
  return file.object_key;
}

/**
 * The member's own profile (R001, §10).
 * @param {import('./shared.js').SettingsContext} context
 * @param {object} query
 * @returns {Promise<object>}
 */
export function getProfile(context, query) {
  parse(noQuery, query);
  return read(context, async tx =>
    profileView(
      await memberProfile(context, tx),
      await tenantSettings(context, tx)
    )
  );
}

/**
 * Save or remove overrides, and choose a default image or none (R002, R004,
 * R005). The profile is created on the first save (R001). Choosing a
 * default image, or none, drops an uploaded image and deletes its object.
 * @param {import('./shared.js').SettingsContext} context
 * @param {unknown} body `{ overrides?, defaultImage?, revision }`
 * @returns {Promise<object>}
 */
export async function updateProfile(context, body) {
  const input = parse(profileChangeSchema, body);
  const { saved, tenant, droppedKey } = await mutate(context, async tx => {
    const locked = await lockProfile(context, tx);
    if ((locked.row?.revision ?? 0) !== input.revision)
      throw new SettingsError('STALE_REVISION');
    const changes = {};
    if (input.overrides) {
      const overrides = validOverrides(locked.row?.overrides ?? {});
      for (const [name, value] of Object.entries(input.overrides))
        if (value === null) delete overrides[name];
        else overrides[name] = value;
      changes.overrides = overrides;
    }
    let dropped = null;
    if (input.defaultImage !== undefined) {
      changes.default_image = input.defaultImage;
      changes.image_file_id = null;
      dropped = locked.row?.image_file_id ?? null;
    }
    const row = await saveProfile(context, locked, changes, tx);
    return {
      result: {
        saved: row,
        tenant: await tenantSettings(context, tx),
        droppedKey: await archiveImage(context, dropped, tx),
      },
    };
  });
  if (droppedKey) await discardArchived(context, droppedKey);
  return profileView(saved, tenant);
}

/**
 * Upload or replace the member's profile image (R004, R005), clearing a
 * chosen default image. Uses M0006-02's checks, key naming, and cleanup.
 * @param {import('./shared.js').SettingsContext} context
 * @param {{buffer: Buffer, declaredType: string, truncated: boolean} | undefined} upload
 * @returns {Promise<object>}
 */
export async function putProfileImage(context, upload) {
  const { store, file } = await storeImage(context, 'profile_image', upload);
  let outcome;
  try {
    outcome = await mutate(context, async tx => {
      const locked = await lockProfile(context, tx);
      await context.cell.files.record(file, context.actorId, { tx });
      const row = await saveProfile(
        context,
        locked,
        { default_image: null, image_file_id: file.id },
        tx
      );
      return {
        result: {
          saved: row,
          tenant: await tenantSettings(context, tx),
          droppedKey: await archiveImage(
            context,
            locked.row?.image_file_id ?? null,
            tx
          ),
        },
      };
    });
  } catch (error) {
    await discardObject(store, file.object_key);
    throw error;
  }
  if (outcome.droppedKey) await discardObject(store, outcome.droppedKey);
  return profileView(outcome.saved, outcome.tenant);
}

/**
 * Remove the member's uploaded profile image (R005); the account button
 * then shows their initials (R007).
 * @param {import('./shared.js').SettingsContext} context
 * @returns {Promise<object>}
 */
export async function deleteProfileImage(context) {
  const { saved, tenant, droppedKey } = await mutate(context, async tx => {
    const locked = await lockProfile(context, tx);
    const fileId = locked.row?.image_file_id ?? null;
    if (!fileId) throw new SettingsError('NOT_FOUND');
    const row = await saveProfile(context, locked, { image_file_id: null }, tx);
    return {
      result: {
        saved: row,
        tenant: await tenantSettings(context, tx),
        droppedKey: await archiveImage(context, fileId, tx),
      },
    };
  });
  if (droppedKey) await discardArchived(context, droppedKey);
  return profileView(saved, tenant);
}
