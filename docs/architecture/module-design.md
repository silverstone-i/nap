# Module Design

## Purpose

This document defines module ownership and where API code belongs.

## Why

Modules keep related tables, data access, business rules, and APIs together.
Code that spans modules or communicates with external systems lives outside a
module and is named for its responsibility.

## Modules

A module owns one business area in one database and one PostgreSQL schema. It
owns:

- migrations for its tables;
- models that read and write those tables;
- a repository map that exposes its models;
- business rules for its data;
- API routers for its operations;
- controllers used by those routers.

A module does not own a table created by another module. An operation that
uses more than one module belongs in application code outside the modules.

Each module must export a descriptor containing its name, database target,
schema, models, migrations, and entitlement type. Admin and cell descriptors
must use separate registries.

## Module Folders

```text
modules/<module>/
|-- apiRoutes/
|   `-- v1/
|-- controllers/
|-- domain/
|-- models/
|-- schema/
|   `-- migrations/
|-- descriptor.js
`-- repositories.js
```

A module creates only the folders it needs.

### Models

A model defines access to one module-owned table or query. Models contain
database operations, not HTTP behavior.

### Repositories

`repositories.js` maps table names to the module's models. Database composition
uses this map to build the repositories available to a transaction.

### Business Rules

Place a rule according to what it protects:

- Request rules belong in `middleware/`. They check sessions, tenants,
  entitlements, permissions, and request input before an operation runs.
- Module rules belong in the owning module. Reusable decisions belong in
  `domain/`; model-specific checks belong with the model; API-specific checks
  belong with the router operation.
- Workflow rules that require more than one module belong in `application/`.
- Database invariants belong in module migrations as constraints, row-level
  security, or triggers.

Use middleware only for rules that apply across routes. A module rule does not
become middleware because an HTTP request triggers it.

### Controllers

The framework provides `ReadController` and `WriteController`.
`WriteController` extends `ReadController`. Each module defines a
`<Module>Controller` class that extends one of these framework controllers. The
module controller inherits the standard behavior and adds member methods when
the module requires additional behavior.

### API Routers

Routers define API paths, request and response schemas, required capabilities,
and the operation to run. Versioned routers live under `apiRoutes/v1/` and must
be registered with the framework route registry.

The API mounts routers at:

```text
/api/<module>/v<version>/<router>
```

## Capability Terminology

A capability identifies an authorization in `module::router::action` form.
Roles group capabilities; capability evaluation determines whether the supplied
capabilities authorize an action. Use "feature" for application behavior such as
authentication or session management, and "rules" for other constraints.

## Code Outside Modules

Owning no tables is a boundary, not a complete definition. Code outside a
module is classified by when it runs and what it does.

### Lifecycle

| Lifecycle   | Meaning                                                      |
| ----------- | ------------------------------------------------------------ |
| Runtime     | Called by API startup, request handling, or background work. |
| Maintenance | Called only by an operator script or CLI command.            |
| Shared      | Called by both runtime and maintenance entry points.         |

### Responsibility

| Responsibility   | Meaning                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| Application      | Performs an operation using one or more module repositories.             |
| Capability       | Evaluates authorization using `module::router::action` identifiers.      |
| Infrastructure   | Communicates with PostgreSQL, Redis, Render, or another external system. |
| Runtime registry | Maintains runtime connections or health state.                           |

Each file receives one lifecycle and one responsibility.

## API Structure

The API separates modules from cross-module workflows, external systems,
capability evaluation, request middleware, framework code, and operator scripts:

```text
apps/api/src/
|-- application/
|   |-- runtime/
|   |-- shared/
|   `-- maintenance/
|-- infrastructure/
|   |-- cache/
|   |-- provisioning/
|   `-- runtime/
|-- capability/
|-- modules/
|-- middleware/
|-- framework/
`-- scripts/
```

## Placement Rules

- Put table ownership, data access, and module rules in the owning module.
- Put workflows that coordinate repositories or infrastructure in `application/`.
- Put access to external systems outside module-owned data access in `infrastructure/`.
- Put capability evaluation in `capability/`; it does not coordinate workflows or access persistence.
- Put request checks shared across routes in `middleware/`.
- Put database invariants in the owning module's migrations.
- Put reusable HTTP mechanics in `framework/`.
- Keep CLI argument handling and process output in `scripts/`.
