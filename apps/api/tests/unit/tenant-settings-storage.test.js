/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { runtimeConfiguration } from '../../src/application/shared/runtimeConfiguration.js';
import { jsonBodyOnly } from '../../src/middleware/jsonBody.js';
import { createSecretBox } from '../../src/modules/tenant-settings/domain/secrets.js';
import { failureReason } from '../../src/modules/tenant-settings/domain/objectStore.js';
import {
  contentTypeOf,
  imageType,
} from '../../src/modules/tenant-settings/domain/files.js';
import { uploadedFile } from '../../src/modules/tenant-settings/apiRoutes/v1/upload.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);

describe('storage secret encryption (M0006-02-R002)', () => {
  const box = createSecretBox({ encryptionKey: randomBytes(32) });
  const tenantId = randomUUID();

  it('round-trips with a fresh nonce on every write', () => {
    const first = box.seal('secret-access-key', tenantId);
    const second = box.seal('secret-access-key', tenantId);
    expect(first).not.toBe(second);
    expect(first).not.toContain('secret-access-key');
    expect(box.open(first, tenantId)).toBe('secret-access-key');
  });

  it('fails to decrypt a value copied to another tenant', () => {
    const sealed = box.seal('secret-access-key', tenantId);
    expect(() => box.open(sealed, randomUUID())).toThrow();
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => createSecretBox({ encryptionKey: randomBytes(16) })).toThrow(
      TypeError
    );
  });
});

describe('storage configuration (M0006-02-R002)', () => {
  const base = {
    NODE_ENV: 'test',
    ADMIN_DATABASE_TEST: 'db.example/nap_test_admin',
    NAP_APP_PSWD_TEST: 'test-app-password',
    SESSION_SECRET_TEST: 'test-session-secret-of-ample-length-here',
    AUTH_THROTTLE_SECRET_TEST: 'test-throttle-secret-of-ample-length-here',
    KNOWN_DEVICE_SECRET_TEST: 'test-known-device-secret-of-ample-length',
    TAX_ID_ENCRYPTION_KEY_TEST: randomBytes(32).toString('base64'),
    TAX_ID_HASH_KEY_TEST: 'test-tax-id-hash-key-of-ample-length',
    FILE_STORAGE_ENCRYPTION_KEY_TEST: randomBytes(32).toString('base64'),
    APP_ORIGIN_TEST: 'http://localhost:5173',
  };

  it('loads a 32-byte key', () => {
    expect(runtimeConfiguration(base).fileStorage.encryptionKey.length).toBe(
      32
    );
  });

  it('AC01: refuses to start without a valid, distinct key', () => {
    const setting = 'FILE_STORAGE_ENCRYPTION_KEY_TEST';
    for (const value of [
      undefined,
      randomBytes(16).toString('base64'),
      'not base64!',
      '<test-file-storage-encryption-key>',
      base.TAX_ID_ENCRYPTION_KEY_TEST,
    ]) {
      let error;
      try {
        runtimeConfiguration({ ...base, [setting]: value });
      } catch (caught) {
        error = caught;
      }
      expect(error?.code).toBe('INVALID_CONFIGURATION');
      expect(error?.setting).toBe(setting);
    }
  });
});

describe('connection test reasons (M0006-02-R004)', () => {
  it.each([
    [
      { name: 'NoSuchBucket', $metadata: { httpStatusCode: 404 } },
      'BUCKET_NOT_FOUND',
    ],
    [
      { name: 'InvalidAccessKeyId', $metadata: { httpStatusCode: 403 } },
      'ACCESS_DENIED',
    ],
    [
      { name: 'SignatureDoesNotMatch', $metadata: { httpStatusCode: 403 } },
      'ACCESS_DENIED',
    ],
    [{ name: 'Unknown', $metadata: { httpStatusCode: 401 } }, 'ACCESS_DENIED'],
    [
      Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
      'UNREACHABLE',
    ],
    [
      { name: 'InternalError', $metadata: { httpStatusCode: 500 } },
      'UNEXPECTED_RESPONSE',
    ],
  ])('maps %o to %s', (error, reason) => {
    expect(failureReason(error)).toBe(reason);
  });
});

describe('image content check (M0006-02-R007, R008)', () => {
  it.each([
    [PNG, 'image/png'],
    [Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
    [Buffer.from('GIF89a....'), 'image/gif'],
    [Buffer.from('GIF87a....'), 'image/gif'],
    [
      Buffer.concat([
        Buffer.from('RIFF'),
        Buffer.alloc(4),
        Buffer.from('WEBPVP8 '),
      ]),
      'image/webp',
    ],
    [Buffer.from('just some text'), null],
    [Buffer.alloc(0), null],
  ])('reads %o as %s', (buffer, type) => {
    expect(contentTypeOf(buffer)).toBe(type);
  });

  it('refuses text named as an image, a type mismatch, and empty or oversized files', () => {
    const bad = [
      {
        buffer: Buffer.from('hello'),
        declaredType: 'image/png',
        truncated: false,
      },
      { buffer: PNG, declaredType: 'image/jpeg', truncated: false },
      { buffer: Buffer.alloc(0), declaredType: 'image/png', truncated: false },
      { buffer: PNG, declaredType: 'image/png', truncated: true },
      undefined,
    ];
    for (const upload of bad)
      expect(() => imageType(upload)).toThrow(
        expect.objectContaining({ code: 'INVALID_INPUT' })
      );
    expect(
      imageType({ buffer: PNG, declaredType: 'image/png', truncated: false })
    ).toBe('image/png');
  });
});

describe('upload parsing (M0006-02-R008)', () => {
  const app = express();
  app.use(jsonBodyOnly({ uploadPaths: ['/upload'] }));
  app.put('/upload', uploadedFile(), (req, res) =>
    res.json({
      size: req.upload.buffer.length,
      type: req.upload.declaredType,
      truncated: req.upload.truncated,
    })
  );
  app.put('/json', (_req, res) => res.json({ ok: true }));

  it('reads one file field', async () => {
    const response = await request(app).put('/upload').attach('file', PNG, {
      filename: '../../evil.png',
      contentType: 'image/png',
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      size: PNG.length,
      type: 'image/png',
      truncated: false,
    });
  });

  it('stops reading past 2 MB and marks the upload truncated', async () => {
    const response = await request(app)
      .put('/upload')
      .attach('file', Buffer.alloc(3 * 1024 * 1024), {
        filename: 'big.png',
        contentType: 'image/png',
      });
    expect(response.body.truncated).toBe(true);
    expect(response.body.size).toBe(2 * 1024 * 1024);
  });

  it('refuses another field name, extra fields, and JSON bodies', async () => {
    const wrongField = await request(app)
      .put('/upload')
      .attach('image', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(wrongField.body.error.code).toBe('INVALID_INPUT');
    const extra = await request(app)
      .put('/upload')
      .field('note', 'x')
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(extra.body.error.code).toBe('INVALID_INPUT');
    const json = await request(app).put('/upload').send({ a: 1 });
    expect(json.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('keeps every other route JSON-only', async () => {
    const response = await request(app)
      .put('/json')
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});
