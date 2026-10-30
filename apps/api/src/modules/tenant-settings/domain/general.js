/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The tenant's general settings (M0006-01-R001–R008). The stored row
 * holds only saved values; reads lay them over the shared schema's
 * defaults, so a setting added to the schema needs no migration (R003).
 */

import {
  effectiveGeneralSettings,
  generalSettingsChangeSchema,
  resolveGeneralSettings,
} from '@nap/shared';
import { z } from 'zod';
import { SettingsError } from './errors.js';
import { memberProfile } from './profile.js';
import { mutate, parse, read } from './shared.js';

const updateSchema = z.strictObject({
  settings: generalSettingsChangeSchema,
  revision: z.number().int().positive(),
});
const noQuery = z.strictObject({});

/**
 * The tenant's settings row, or `NOT_FOUND` when provisioning has not
 * created it (R009).
 * @param {object} cell
 * @param {string} tenantId
 * @param {{tx: object, lock?: boolean}} options
 * @returns {Promise<object>}
 */
async function settingsRow(cell, tenantId, options) {
  const row = await cell.tenant_settings.byTenant(tenantId, options);
  if (!row) throw new SettingsError('NOT_FOUND');
  return row;
}

/**
 * Safe projection of the settings row (R005).
 * @param {object} row
 * @returns {{settings: object, revision: number}}
 */
function generalView(row) {
  return {
    settings: resolveGeneralSettings(row.settings),
    revision: row.revision,
  };
}

/**
 * The tenant's effective general settings, for use inside another module's
 * transaction, such as the phone default country (M0006-01-R011).
 * @param {object} cell Cell repository handle.
 * @param {string} tenantId
 * @param {object} tx A transaction already scoped to `tenantId`.
 * @returns {Promise<Record<string, unknown>>}
 */
export async function effectiveSettings(cell, tenantId, tx) {
  const row = await cell.tenant_settings.byTenant(tenantId, { tx });
  return effectiveGeneralSettings(row?.settings ?? {});
}

/**
 * Every general setting with its stored value or default (R005).
 * @param {import('./shared.js').SettingsContext} context
 * @param {object} query
 * @returns {Promise<object>}
 */
export function getGeneral(context, query) {
  parse(noQuery, query);
  return read(context, async tx =>
    generalView(await settingsRow(context.cell, context.tenant.id, { tx }))
  );
}

/**
 * Refuse a country or currency M0004 does not list (R007).
 * @param {object} change
 * @param {object} tx
 * @returns {Promise<void>}
 * @throws {SettingsError} `INVALID_INPUT`
 */
async function requireReferenceCodes(change, tx) {
  const checks = [
    ['defaultCountry', 'reference.countries'],
    ['currency', 'reference.currencies'],
  ];
  for (const [name, table] of checks) {
    const code = change[name];
    if (code == null) continue;
    const found = await tx.oneOrNone(`SELECT 1 FROM ${table} WHERE code = $1`, [
      code,
    ]);
    if (!found) throw new SettingsError('INVALID_INPUT');
  }
}

/**
 * Save or reset one or more general settings (R006, R007). `null` removes a
 * stored value, returning the setting to its default.
 * @param {import('./shared.js').SettingsContext} context
 * @param {unknown} body `{ settings: { <name>: value | null }, revision }`
 * @returns {Promise<object>}
 */
export function updateGeneral(context, body) {
  const input = parse(updateSchema, body);
  return mutate(context, async tx => {
    const locked = await settingsRow(context.cell, context.tenant.id, {
      tx,
      lock: true,
    });
    if (locked.revision !== input.revision)
      throw new SettingsError('STALE_REVISION');
    await requireReferenceCodes(input.settings, tx);
    const before = resolveGeneralSettings(locked.settings);
    const stored = { ...locked.settings };
    for (const [name, value] of Object.entries(input.settings))
      if (value === null) delete stored[name];
      else stored[name] = value;
    const row = await context.cell.tenant_settings.saveSettings(
      context.tenant.id,
      stored,
      context.actorId,
      { tx }
    );
    const view = generalView(row);
    const changed = Object.keys(input.settings);
    const pick = settings =>
      JSON.stringify(
        Object.fromEntries(changed.map(name => [name, settings[name].value]))
      );
    return {
      result: view,
      changes: [
        {
          eventKey: 'tenant_settings.updated',
          details: {
            changed_fields: changed.join(','),
            before: pick(before),
            after: pick(view.settings),
            revision: row.revision,
          },
        },
      ],
    };
  });
}

/**
 * The values to apply for the signed-in member (R008): their override, else
 * the tenant's stored value, else the default (M0006-03-R003). Also the
 * file IDs of the light and dark logos (M0006-04), whether storage is connected, and the member's
 * profile image; an uploaded image is offered only while storage is
 * connected, so the shell falls back to initials (M0006-03-R007).
 * @param {import('./shared.js').SettingsContext} context
 * @param {object} query
 * @returns {Promise<Record<string, unknown>>}
 */
export function getEffective(context, query) {
  parse(noQuery, query);
  return read(context, async tx => {
    const row = await context.cell.tenant_settings.byTenant(context.tenant.id, {
      tx,
    });
    const profile = await memberProfile(context, tx);
    const storageConnected = Boolean(
      await context.cell.file_storage.byTenant(context.tenant.id, { tx })
    );
    let profileImage = null;
    if (profile?.default_image)
      profileImage = { defaultImage: profile.default_image };
    else if (profile?.image_file_id && storageConnected)
      profileImage = { fileId: profile.image_file_id };
    return {
      ...effectiveGeneralSettings(row?.settings ?? {}, profile?.overrides),
      // M0006-02-R014, M0006-04-R004: the shell asks for the link of the
      // logo matching its theme by these IDs.
      logoLightFileId:
        (await context.cell.files.activeLogo('light', { tx }))?.id ?? null,
      logoDarkFileId:
        (await context.cell.files.activeLogo('dark', { tx }))?.id ?? null,
      // M0006-02-R013: upload controls show only when storage is connected.
      storageConnected,
      profileImage,
    };
  });
}
