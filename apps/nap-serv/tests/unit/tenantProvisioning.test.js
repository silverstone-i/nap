/**
 * @file Unit tests for tenantProvisioning service
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { describe, it, expect } from 'vitest';

// Import only the function signature to test validation logic.
// Full integration tests require a running database and are covered separately.
describe('provisionTenant validation', () => {
  it('rejects missing schemaName', async () => {
    const { provisionTenant } = await import('../../src/services/tenantProvisioning.js');
    await expect(provisionTenant({})).rejects.toThrow(TypeError);
  });

  it('rejects reserved schema names', async () => {
    const { provisionTenant } = await import('../../src/services/tenantProvisioning.js');
    await expect(provisionTenant({ schemaName: 'admin' })).rejects.toThrow(/reserved schema/);
    await expect(provisionTenant({ schemaName: 'public' })).rejects.toThrow(/reserved schema/);
    await expect(provisionTenant({ schemaName: 'pgschemata' })).rejects.toThrow(/reserved schema/);
  });
});
