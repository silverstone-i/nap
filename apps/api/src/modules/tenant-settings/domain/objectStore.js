/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file The tenant's bucket, reached through the Amazon S3 programming
 * interface (M0006-02). Any S3-compatible service works: Amazon S3,
 * Cloudflare R2, Backblaze B2, or MinIO.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/** Longest a signed link stays valid: 15 minutes (M0006-02-R010). */
export const LINK_SECONDS = 15 * 60;

/** Service error names that mean the key or its permissions are wrong. */
const ACCESS_ERRORS = new Set([
  'AccessDenied',
  'InvalidAccessKeyId',
  'SignatureDoesNotMatch',
  'Forbidden',
  'InvalidToken',
]);

/**
 * The one reason a bucket call failed (M0006-02-R004).
 * @param {any} error An error thrown by the S3 client.
 * @returns {'UNREACHABLE'|'ACCESS_DENIED'|'BUCKET_NOT_FOUND'|'UNEXPECTED_RESPONSE'}
 */
export function failureReason(error) {
  const status = error?.$metadata?.httpStatusCode;
  if (error?.name === 'NoSuchBucket') return 'BUCKET_NOT_FOUND';
  if (ACCESS_ERRORS.has(error?.name) || status === 401 || status === 403)
    return 'ACCESS_DENIED';
  if (status === undefined) return 'UNREACHABLE';
  return 'UNEXPECTED_RESPONSE';
}

/**
 * The bucket behind one saved connection.
 *
 * Amazon S3 endpoints address the bucket by host name; every other service
 * gets the bucket in the path, which all S3-compatible services accept.
 * Checksums are sent only when an operation requires them, because several
 * S3-compatible services refuse the newer default checksum headers.
 * @param {{endpoint: string, region: string, bucket: string, accessKeyId: string, secretAccessKey: string}} connection
 * @returns {{put: Function, get: Function, delete: Function, signedGetUrl: Function}}
 */
export function createObjectStore({
  endpoint,
  region,
  bucket,
  accessKeyId,
  secretAccessKey,
}) {
  const client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: !new URL(endpoint).hostname.endsWith('.amazonaws.com'),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 },
  });
  return {
    /**
     * @param {string} key
     * @param {Buffer} body
     * @param {string} contentType
     * @returns {Promise<void>}
     */
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        })
      );
    },
    /**
     * @param {string} key
     * @returns {Promise<Buffer>}
     */
    async get(key) {
      const result = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      );
      return Buffer.from(await result.Body.transformToByteArray());
    },
    /**
     * @param {string} key
     * @returns {Promise<void>}
     */
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    /**
     * A link the browser can fetch without credentials (R010).
     * @param {string} key
     * @param {number} seconds
     * @returns {Promise<string>}
     */
    signedGetUrl(key, seconds) {
      return getSignedUrl(
        client,
        new GetObjectCommand({ Bucket: bucket, Key: key }),
        { expiresIn: seconds }
      );
    },
  };
}
