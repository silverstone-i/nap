/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The tenant's file storage contract (M0006-02): the connection a
 * tenant saves, the view the API returns without its secret, the file
 * types nap stores, and the signed link to a stored file.
 */
import { z } from 'zod';

/** Image types every file purpose allows (M0006-02-R007). */
export const IMAGE_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

/** Largest file nap stores: 2 MB (M0006-02-R007). */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Reasons a connection test fails (M0006-02-R004). */
export const STORAGE_TEST_REASONS = Object.freeze([
  'UNREACHABLE',
  'ACCESS_DENIED',
  'BUCKET_NOT_FOUND',
  'UNEXPECTED_RESPONSE',
]);

const endpoint = z
  .string()
  .trim()
  .max(2048)
  .refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  });
const text = max => z.string().trim().min(1).max(max);

/**
 * `PUT /storage` (M0006-02-R001, R005). `secretAccessKey` may be left out
 * to keep the saved secret; `revision` is `null` when connecting.
 */
export const storageChangeSchema = z.strictObject({
  endpoint,
  region: text(64),
  bucket: text(63),
  accessKeyId: text(128),
  secretAccessKey: text(256).optional(),
  revision: z.number().int().positive().nullable(),
});

/** `GET /storage` and `PUT /storage`: the connection without its secret, or `null` (R003). */
export const storageViewSchema = z
  .strictObject({
    endpoint: z.string(),
    region: z.string(),
    bucket: z.string(),
    accessKeyId: z.string(),
    secretSet: z.literal(true),
    revision: z.number().int().positive(),
  })
  .nullable();

/** `GET /files/:id/link` (R010). */
export const fileLinkSchema = z.strictObject({
  url: z.string().url(),
  expiresAt: z.string().datetime(),
});

/** `PUT /logo` (R013). */
export const logoViewSchema = z.strictObject({
  logoFileId: z.string().uuid(),
});
