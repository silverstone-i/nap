'use strict';

/*
 * Unit tests for apiRoutes.js
 */

import apiRoutes from '../../../src/apiRoutes.js'; 
import tenantApiRoutes from '../../../modules/tenants/apiRoutes/v1ApiRoutes.js'; 

describe('apiRoutes', () => {
  it('should export an array', () => {
    expect(Array.isArray(apiRoutes)).toBe(true);
  });

  it('should include tenant module routes when enabled', () => {
    const tenantRoute = apiRoutes.find(route => route.prefix === 'tenants/v1');
    expect(tenantRoute).toBeDefined();
    expect(tenantRoute.routes).toEqual(tenantApiRoutes);
  });

  it('should not include modules that are not enabled', () => {
    const accountingRoute = apiRoutes.find(route => route.prefix === 'accounting/v1');
    expect(accountingRoute).toBeUndefined();
  });
});
