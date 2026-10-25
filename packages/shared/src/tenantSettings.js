/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The general settings schema (M0006-01-R002–R004). Every general
 * setting's allowed values, default, and whether a member may override it
 * live here, so the API validates and the web app displays from one
 * definition. Adding a setting adds an entry, with no migration (R003).
 */
import { z } from 'zod';

/** IANA time zone names this runtime knows, plus `UTC`. */
export const TIME_ZONES = Object.freeze([
  ...new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']),
]);
const timeZones = new Set(TIME_ZONES);

/** Date formats a tenant can choose (M0006-01-R004). */
export const DATE_FORMATS = Object.freeze([
  'MM/DD/YYYY',
  'DD/MM/YYYY',
  'YYYY-MM-DD',
]);

/** Languages nap ships (M0006-01-R004). */
export const LANGUAGES = Object.freeze(['en']);

/** Page sizes a standard grid offers (I0001-R015). */
export const RECORDS_PER_PAGE = Object.freeze([25, 50, 100]);

/**
 * Every general setting: its value schema, its schema default, and whether a
 * member may override it (M0006-01-R004). Country and currency are checked
 * against M0004's lists by the API when saved (R007).
 */
export const GENERAL_SETTINGS = Object.freeze({
  defaultCountry: Object.freeze({
    schema: z.string().regex(/^[A-Z]{2}$/),
    default: 'US',
    overridable: false,
  }),
  currency: Object.freeze({
    schema: z.string().regex(/^[A-Z]{3}$/),
    default: 'USD',
    overridable: false,
  }),
  timeZone: Object.freeze({
    schema: z.string().refine(value => timeZones.has(value)),
    default: 'America/New_York',
    overridable: true,
  }),
  dateFormat: Object.freeze({
    schema: z.enum(DATE_FORMATS),
    default: 'MM/DD/YYYY',
    overridable: true,
  }),
  language: Object.freeze({
    schema: z.enum(LANGUAGES),
    default: 'en',
    overridable: true,
  }),
  recordsPerPage: Object.freeze({
    schema: z.union(RECORDS_PER_PAGE.map(size => z.literal(size))),
    default: 25,
    overridable: true,
  }),
});

const NAMES = Object.keys(GENERAL_SETTINGS);
const each = build =>
  Object.fromEntries(NAMES.map(name => [name, build(name)]));

/**
 * Every general setting at its schema default.
 * @returns {Record<string, unknown>}
 */
export function settingDefaults() {
  return each(name => GENERAL_SETTINGS[name].default);
}

/**
 * Every general setting with its stored value, or its schema default when
 * none is stored or the stored value no longer fits the schema (R005). A
 * stored setting the schema no longer defines is dropped.
 * @param {Record<string, unknown>} stored The tenant's stored settings.
 * @returns {Record<string, {value: unknown, stored: boolean}>}
 */
export function resolveGeneralSettings(stored) {
  return each(name => {
    const has =
      Object.hasOwn(stored, name) &&
      GENERAL_SETTINGS[name].schema.safeParse(stored[name]).success;
    return has
      ? { value: stored[name], stored: true }
      : { value: GENERAL_SETTINGS[name].default, stored: false };
  });
}

/**
 * The effective value of every general setting for a tenant, before member
 * overrides (M0006-01-R008).
 * @param {Record<string, unknown>} stored
 * @returns {Record<string, unknown>}
 */
export function effectiveGeneralSettings(stored) {
  const resolved = resolveGeneralSettings(stored);
  return each(name => resolved[name].value);
}

/**
 * A change to general settings: one or more known settings, each a value the
 * schema allows or `null` to return it to its default (R006).
 */
export const generalSettingsChangeSchema = z
  .strictObject(
    each(name => GENERAL_SETTINGS[name].schema.nullable().optional())
  )
  .refine(change => Object.keys(change).length > 0);

/** Zod schema for `GET /general` and `PATCH /general` (R005). */
export const generalSettingsViewSchema = z.strictObject({
  settings: z.strictObject(
    each(name =>
      z.strictObject({
        value: GENERAL_SETTINGS[name].schema,
        stored: z.boolean(),
      })
    )
  ),
  revision: z.number().int().positive(),
});

/**
 * Zod schema for `GET /effective` (R008): every general setting, plus the
 * tenant logo's file ID, or `null`, for the shell (M0006-02-R014), and
 * whether storage is connected, which shows the logo control (R013).
 */
export const effectiveSettingsSchema = z.strictObject({
  ...each(name => GENERAL_SETTINGS[name].schema),
  logoFileId: z.string().uuid().nullable(),
  storageConnected: z.boolean(),
});
