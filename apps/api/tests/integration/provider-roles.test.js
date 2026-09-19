/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { using } from '../../src/infrastructure/runtime/adminDatabase.js';
import {
  prepareProviderRoles,
  verifyRoles,
} from '../../src/infrastructure/provisioning/postgres.js';
const fixture = process.env.FOUNDATION_TEST_URL;
if (!fixture)
  throw new Error('FOUNDATION_TEST_URL must identify a disposable server');
it('creates absent application roles through provider credentials and preserves them on retry', async () => {
  const name = 'nap_provider_' + randomUUID().replaceAll('-', '');
  const url = new URL(fixture);
  url.pathname = '/' + name;
  const provider = 'provider_' + randomUUID().replaceAll('-', '');
  url.username = provider;
  url.password = 'provider-fixture';
  const renamed = [];
  await using(fixture, async admin => {
    try {
      for (const role of ['nap-admin', 'nap-app'])
        if (
          await admin.oneOrNone('SELECT 1 FROM pg_roles WHERE rolname=$1', [
            role,
          ])
        ) {
          await admin.none('ALTER ROLE $1:name RENAME TO $2:name', [
            role,
            'saved-' + role,
          ]);
          renamed.push(role);
        }
      await admin.none(
        'CREATE ROLE $1:name LOGIN NOSUPERUSER NOBYPASSRLS CREATEDB CREATEROLE PASSWORD $2',
        [provider, 'provider-fixture']
      );
      await admin.none('CREATE DATABASE $1:name OWNER $2:name', [
        name,
        provider,
      ]);
      const config = {
        database: name,
        endpoint: url.host + '/' + name,
        adminPassword: 'provider-admin-fixture',
        appPassword: 'provider-app-fixture',
      };
      await prepareProviderRoles(url.href, config);
      await using(url.href, db => verifyRoles(db));
      const before = await admin.any(
        "SELECT rolname,rolpassword FROM pg_authid WHERE rolname IN ('nap-admin','nap-app') ORDER BY rolname"
      );
      await prepareProviderRoles(url.href, config);
      expect(
        await admin.any(
          "SELECT rolname,rolpassword FROM pg_authid WHERE rolname IN ('nap-admin','nap-app') ORDER BY rolname"
        )
      ).toEqual(before);
      expect(
        (
          await admin.one(
            'SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=$1',
            [name]
          )
        ).owner
      ).toBe('nap-admin');
    } finally {
      await admin.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [name]);
      for (const role of ['nap-app', 'nap-admin']) {
        await admin.none('DROP ROLE IF EXISTS $1:name', [role]);
        if (renamed.includes(role))
          await admin.none('ALTER ROLE $1:name RENAME TO $2:name', [
            'saved-' + role,
            role,
          ]);
      }
      await admin.none('DROP ROLE IF EXISTS $1:name', [provider]);
    }
  });
}, 30000);
