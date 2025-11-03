import { describe, expect, it } from 'vitest';
import { defineMigration, sortMigrations } from '../../../../src/db/migrations/defineMigration.js';

describe('defineMigration', () => {
  it('normalizes config and freezes result', () => {
    const migration = defineMigration({
      id: '202502110001-demo',
      description: 'demo migration',
      up: async () => {},
      down: async () => {},
    });

    expect(migration.id).toBe('202502110001-demo');
    expect(migration.description).toBe('demo migration');
    expect(Object.isFrozen(migration)).toBe(true);
  });

  it('sorts migrations using lexical id ordering', () => {
    const m1 = defineMigration({ id: '202502110002', up: async () => {} });
    const m2 = defineMigration({ id: '202502110001', up: async () => {} });

    const sorted = sortMigrations([m1, m2]);

    expect(sorted[0].id).toBe('202502110001');
    expect(sorted[1].id).toBe('202502110002');
  });
});
