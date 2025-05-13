/**
 * Sets up a test tenant by creating the tenant schema.
 * @param {string} tenantId
 */
export async function setupTestTenant() {
  const schemaList = ['admin', 'tenantid'];
  for (const schema of schemaList) {
    if (schema !== 'public') {
      await db.none(
        `DROP SCHEMA IF EXISTS ${schema} CASCADE; CREATE SCHEMA ${schema};`
      );
    }
  }
  const runMigrate = (await import('../../../scripts/runMigrate.js')).default;
  await runMigrate(db, { schemas: schemaList }, true);
}

/**
 * Tears down a test tenant by dropping the tenant schema.
 * @param {string} tenantId
 */
export async function teardownTestTenant(tenantId) {
  // await dropTenant(tenantId);
}
