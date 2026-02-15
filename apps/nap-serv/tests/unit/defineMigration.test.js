/**
 * @file Unit tests for defineMigration and sortMigrations
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect } from 'vitest';
import { defineMigration, sortMigrations } from '../../src/db/migrations/defineMigration.js';

describe('defineMigration', () => {
  it('returns a frozen migration object with id, description, up, down, and checksum', () => {
    const up = async () => {};
    const down = async () => {};
    const migration = defineMigration({ id: 'test-001', description: 'test migration', up, down });

    expect(migration.id).toBe('test-001');
    expect(migration.description).toBe('test migration');
    expect(migration.up).toBe(up);
    expect(migration.down).toBe(down);
    expect(typeof migration.checksum).toBe('string');
    expect(migration.checksum.length).toBe(64); // SHA-256 hex
    expect(Object.isFrozen(migration)).toBe(true);
  });

  it('defaults description to null and down to a noop', () => {
    const up = async () => {};
    const migration = defineMigration({ id: 'test-002', up });

    expect(migration.description).toBeNull();
    expect(typeof migration.down).toBe('function');
  });

  it('throws on missing config', () => {
    expect(() => defineMigration()).toThrow(TypeError);
    expect(() => defineMigration(null)).toThrow(TypeError);
  });

  it('throws on missing or invalid id', () => {
    expect(() => defineMigration({ up: async () => {} })).toThrow(TypeError);
    expect(() => defineMigration({ id: '', up: async () => {} })).toThrow(TypeError);
    expect(() => defineMigration({ id: 123, up: async () => {} })).toThrow(TypeError);
  });

  it('throws when up is not a function', () => {
    expect(() => defineMigration({ id: 'test-003', up: 'not-a-fn' })).toThrow(TypeError);
  });

  it('throws when down is not a function', () => {
    expect(() => defineMigration({ id: 'test-004', up: async () => {}, down: 'nope' })).toThrow(TypeError);
  });

  it('produces deterministic checksums', () => {
    const a = defineMigration({ id: 'same-id', description: 'same desc', up: async () => {} });
    const b = defineMigration({ id: 'same-id', description: 'same desc', up: async () => {} });

    expect(a.checksum).toBe(b.checksum);
  });

  it('produces different checksums for different ids', () => {
    const a = defineMigration({ id: 'id-a', up: async () => {} });
    const b = defineMigration({ id: 'id-b', up: async () => {} });

    expect(a.checksum).not.toBe(b.checksum);
  });
});

describe('sortMigrations', () => {
  it('sorts migrations by id ascending', () => {
    const migrations = [
      defineMigration({ id: '202502110010-core', up: async () => {} }),
      defineMigration({ id: '202502110001-admin', up: async () => {} }),
      defineMigration({ id: '202502110020-projects', up: async () => {} }),
    ];

    const sorted = sortMigrations(migrations);

    expect(sorted.map((m) => m.id)).toEqual([
      '202502110001-admin',
      '202502110010-core',
      '202502110020-projects',
    ]);
  });

  it('returns empty array for undefined input', () => {
    expect(sortMigrations()).toEqual([]);
  });

  it('does not mutate the original array', () => {
    const migrations = [
      defineMigration({ id: 'b', up: async () => {} }),
      defineMigration({ id: 'a', up: async () => {} }),
    ];
    const original = [...migrations];
    sortMigrations(migrations);

    expect(migrations[0].id).toBe(original[0].id);
  });
});
