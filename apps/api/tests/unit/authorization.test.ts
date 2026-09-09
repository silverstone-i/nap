/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { it, expect } from 'vitest';
import { buildPolicy } from '../../src/services/authorization.js';
import type { ScopedGrant } from '../../src/services/authorization.js';
/** Does: Builds a scoped fixture grant. Called by: policy tests. */
function grant(values: Partial<ScopedGrant>): ScopedGrant {
  return {
    id: 'assignment',
    roleId: 'role',
    scope: 'projects',
    projects: ['a'],
    companies: [],
    capabilities: ['projects::projects::read'],
    fields: [],
    ...values,
  };
}
it('keeps positive sensitive-field grants attached to their project scopes', () => {
  const policy = buildPolicy(
    'projects::projects',
    'read',
    {
      admin: false,
      grants: [
        grant({ scope: 'all_projects' }),
        grant({
          fields: [
            {
              resource: 'projects::projects',
              group: 'profitability',
              view: true,
              edit: false,
            },
          ],
        }),
      ],
    },
    undefined,
    [],
    [{ name: 'profitability', columns: ['profit'] }]
  );
  expect(policy.redact({ id: 'a', profit: 123 })).toEqual({
    id: 'a',
    profit: 123,
  });
  expect(policy.redact({ id: 'b', profit: 123 })).toEqual({ id: 'b' });
  expect(() => policy.write({ profit: 5 }, { id: 'a' })).toThrow();
  expect(() => policy.query(['profit'])).toThrow();
});
it('does not combine a broad scope with an unrelated editing capability', () => {
  const policy = buildPolicy(
    'projects::projects',
    'update',
    {
      admin: false,
      grants: [
        grant({ scope: 'all_projects' }),
        grant({ capabilities: ['projects::projects::update'] }),
      ],
    },
    undefined
  );
  expect(() => policy.check({ id: 'a' })).not.toThrow();
  expect(() => policy.check({ id: 'b' })).toThrow();
  expect(policy.filters).toEqual({ id: { $in: ['a'] } });
  expect(() => policy.check({ id: 'new' }, true)).toThrow();
});
it('distinguishes company resources from explicit company-project scope', () => {
  const policy = buildPolicy(
    'projects::projects',
    'read',
    {
      admin: false,
      grants: [
        grant({ scope: 'companies', companies: ['company'], projects: [] }),
      ],
    },
    undefined,
    [{ id: 'a', company_id: 'company' }]
  );
  expect(() => policy.check({ id: 'a', company_id: 'company' })).toThrow();
  expect(policy.filters).toEqual({ id: { $in: [] } });
});
