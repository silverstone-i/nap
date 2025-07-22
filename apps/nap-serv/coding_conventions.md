# Coding Conventions

This document describes the coding conventions used throughout the project to ensure consistency and maintainability.

## Repository Pattern

- Repository objects are exported as the default export from each module's repository file (e.g., `coreRepositories.js`, `bomRepositories.js`).
- Keys in repository objects use camelCase and are descriptive of the model (e.g., `vendors`, `contacts`, `catalogSkus`, `vendorSkus`).
- Each key maps to a model class imported from the module's `models` directory.
- Example:
  ```js
  import Vendors from './models/Vendors.js';
  import Contacts from './models/Contacts.js';
  // ...
  const repositories = {
    vendors: Vendors,
    contacts: Contacts,
    // ...
  };
  export default repositories;
  ```

## Model Classes

- Model classes extend `TableModel` from the `pg-schemata` library.
- Each model is defined in its own file in the `models` directory of the module.
- Example:
  ```js
  import { TableModel } from 'pg-schemata';
  import vendorsSchema from '../schemas/vendorsSchema.js';
  class Vendors extends TableModel {
    constructor(db, pgp, logger = null) {
      super(db, pgp, vendorsSchema, logger);
    }
  }
  export default Vendors;
  ```

## Controller Pattern

- Controllers extend `BaseController` from the shared utils.
- Each controller is defined in its own file in the `controllers` directory of the module.
- The controller class is instantiated and exported as the default export. The class itself is also exported for testing.
- Example:
  ```js
  import BaseController from '../../../src/utils/BaseController.js';
  class ProjectsController extends BaseController {
    constructor() {
      super('projects');
    }
  }
  const instance = new ProjectsController();
  export default instance;
  export { ProjectsController };
  ```
- For controllers with custom logic, methods are added to the class (e.g., `importXls`, `exportXls`).

## API Routes Pattern

- API route files use Express routers.
- Each router is defined in its own file in the `apiRoutes/v1` directory of the module.
- Routers import controller instances and use a shared `createRouter` utility to wire up REST endpoints.
- Example:
  ```js
  import createRouter from '../../../src/utils/createRouter.js';
  import ProjectsController from '../controllers/ProjectsController.js';
  const router = createRouter(ProjectsController);
  export default router;
  ```
- The main module API router (e.g., `bomApiRoutes.js`) aggregates sub-routers and mounts them under versioned paths:
  ```js
  import express from 'express';
  import catalogItemsRouter from './catalogItemsRouter.js';
  // ...
  const router = express.Router();
  router.use('/v1/catalog-items', catalogItemsRouter);
  export default router;
  ```

## Schema Definition Pattern

- Table schemas are defined using the typedefs from `pg-schemata/src/schemaTypes.d.ts` for type safety and consistency.
- Each schema file should import the relevant typedef (e.g., `TableSchema`) and use JSDoc comments to annotate the schema object.
- Example:
  ```js
  /** @typedef {import('pg-schemata/src/schemaTypes').TableSchema} TableSchema */
  /** @type {TableSchema} */
  const vendorsSchema = {
    dbSchema: 'tenantid',
    table: 'vendors',
    hasAuditFields: true,
    version: '1.0.0',
    softDelete: true,
    columns: [
      { name: 'id', type: 'uuid', default: 'uuidv7()', notNull: true, immutable: true },
      { name: 'tenant_code', type: 'varchar(6)', notNull: true },
      // ...
    ],
    constraints: {
      primaryKey: ['id'],
      unique: [['tenant_code', 'vendor_code']],
      indexes: [{ type: 'Index', columns: ['vendor_code'] }],
      foreignKeys: [
        {
          type: 'ForeignKey',
          columns: ['tenant_code'],
          references: {
            table: 'tenants',
            columns: ['code'],
          },
          onDelete: 'cascade',
        },
      ],
    },
  };
  export default vendorsSchema;
  ```
- Use camelCase for schema file names (e.g., `vendorsSchema.js`).
- Always export the schema object as the default export.

- Use PascalCase for model files (e.g., `Vendors.js`, `CatalogSkus.js`).
- Use camelCase for schema files (e.g., `vendorsSchema.js`, `catalogSkusSchema.js`).
- Use PascalCase for controller files (e.g., `ProjectsController.js`).
- Use camelCase for router files (e.g., `catalogItemsRouter.js`).
- Repository files are named as `<module>Repositories.js`.

## General JavaScript Conventions

- Use `'use strict';` at the top of each file.
- Include copyright and license comments at the top.
- Prefer ES6 module syntax (`import`/`export`).
- Use 2 spaces for indentation.
- Use single quotes for strings.

---

For questions or updates to these conventions, please edit this file or contact the project maintainer.
