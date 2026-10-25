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

/** Settings a member may override (M0006-01-R004, M0006-03-R002). */
export const OVERRIDABLE_SETTINGS = Object.freeze(
  NAMES.filter(name => GENERAL_SETTINGS[name].overridable)
);

/**
 * The member's overrides that still fit the schema: only overridable
 * settings, each with a value the schema allows (M0006-03-R002). A stored
 * override that no longer fits is dropped, as a stale tenant value is.
 * @param {Record<string, unknown>} overrides
 * @returns {Record<string, unknown>}
 */
export function validOverrides(overrides) {
  return Object.fromEntries(
    OVERRIDABLE_SETTINGS.filter(
      name =>
        Object.hasOwn(overrides, name) &&
        GENERAL_SETTINGS[name].schema.safeParse(overrides[name]).success
    ).map(name => [name, overrides[name]])
  );
}

/**
 * The effective value of every general setting: the member's override,
 * else the tenant's stored value, else the schema default (M0006-01-R008,
 * M0006-03-R003).
 * @param {Record<string, unknown>} stored The tenant's stored settings.
 * @param {Record<string, unknown>} [overrides] The member's overrides.
 * @returns {Record<string, unknown>}
 */
export function effectiveGeneralSettings(stored, overrides = {}) {
  const resolved = resolveGeneralSettings(stored);
  const own = validOverrides(overrides);
  return each(name =>
    Object.hasOwn(own, name) ? own[name] : resolved[name].value
  );
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

/** Default profile images nap ships, by name (M0006-03-R004). */
export const DEFAULT_PROFILE_IMAGES = Object.freeze([
  'orbit',
  'pulse',
  'wave',
  'spark',
  'bloom',
  'tide',
]);

/** A member's profile image: a default image, an uploaded file, or none. */
const profileImageSchema = z
  .union([
    z.strictObject({ defaultImage: z.enum(DEFAULT_PROFILE_IMAGES) }),
    z.strictObject({ fileId: z.string().uuid() }),
  ])
  .nullable();

/**
 * Zod schema for `GET /effective` (R008): every general setting, plus the
 * tenant logo's file ID, or `null`, for the shell (M0006-02-R014), whether
 * storage is connected, which shows the upload controls (R013), and the
 * member's profile image (M0006-03-R004, R007).
 */
export const effectiveSettingsSchema = z.strictObject({
  ...each(name => GENERAL_SETTINGS[name].schema),
  logoFileId: z.string().uuid().nullable(),
  storageConnected: z.boolean(),
  profileImage: profileImageSchema,
});

const overridesShape = Object.fromEntries(
  OVERRIDABLE_SETTINGS.map(name => [name, GENERAL_SETTINGS[name].schema])
);

/**
 * `GET /profile` and its writes (M0006-03 §10); `revision` 0 before the
 * profile exists. `tenantValues` holds the tenant's value of each
 * overridable setting, shown beside the member's override (R006).
 */
export const profileViewSchema = z.strictObject({
  overrides: z.strictObject(overridesShape).partial(),
  tenantValues: z.strictObject(overridesShape),
  defaultImage: z.enum(DEFAULT_PROFILE_IMAGES).nullable(),
  imageFileId: z.string().uuid().nullable(),
  revision: z.number().int().nonnegative(),
});

/**
 * `PATCH /profile` (M0006-03-R002, R004): overrides of overridable settings
 * only, each a value or `null` to remove it, and a default image or `null`.
 */
export const profileChangeSchema = z
  .strictObject({
    overrides: z
      .strictObject(
        Object.fromEntries(
          Object.entries(overridesShape).map(([name, schema]) => [
            name,
            schema.nullable().optional(),
          ])
        )
      )
      .refine(change => Object.keys(change).length > 0)
      .optional(),
    defaultImage: z.enum(DEFAULT_PROFILE_IMAGES).nullable().optional(),
    revision: z.number().int().nonnegative(),
  })
  .refine(
    change =>
      change.overrides !== undefined || change.defaultImage !== undefined
  );
