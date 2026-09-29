# M0004: Reference Data

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Accepted                                                                                                                                                                                                                                                              |
| Type                 | Module                                                                                                                                                                                                                                                                |
| Related architecture | [Module map](../../architecture/module-map.md), [Migrations](../../architecture/migrations.md), [Admin and cells](../../architecture/admin-cells.md)                                                                                                                  |
| Related PRDs         | [I0003: Cell Provisioning](../inter-module-workflows/I0003-cell-provisioning.md), [M0002-01: Cell database foundation](M0002-cell-tenancy/M0002-01-cell-database-foundation.md), [I0005: RBAC Decision Model](../inter-module-workflows/I0005-rbac-decision-model.md) |
| Related decisions    | None                                                                                                                                                                                                                                                                  |
| Last reviewed        | 2026-09-28                                                                                                                                                                                                                                                            |

## 2. Purpose

Setup forms need standard country and currency values. `reference-data` owns
those lists in each cell's `reference` schema, loads them from a committed
snapshot when a cell is provisioned, and serves them to the web app as lookup
controls.

## 3. Scope

### Included

- The `reference.countries`, `reference.currencies`, and `reference.seed_versions` tables.
- The committed snapshot and its version.
- The seed step that loads the snapshot during cell provisioning.
- The readiness check that blocks a cell without the required seed version.
- Read-only lookup routes and the country and currency lookup controls.

### Excluded

- Applying a new seed version to cells that already exist: roadmap 12, Reference-data rollout. Before release, an existing cell gets reference data by being recreated (Migrations, baseline reset).
- Editing reference data at runtime. Changes come only from a new snapshot version.
- Using the controls in a specific form: each setup module's PRD.
- Other lists such as languages, time zones, or subdivisions.

## 4. Actors And Permissions

| Context              | Actor                    | Required capability                       | Result                                  |
| -------------------- | ------------------------ | ----------------------------------------- | --------------------------------------- |
| Lookup route         | Signed-in user in tenant | `<TENANT>::reference-data::lookups::read` | Returns the list                        |
| Lookup route         | User without the grant   | —                                         | Denied by I0005                         |
| Seed step            | Provisioning worker      | Runs as `nap-admin`                       | Loads the snapshot                      |
| Any write at runtime | Any user                 | —                                         | No route exists; `nap-app` cannot write |

`tenant_admin`, `platform_admin`, and `support` hold the capability through
their wildcard grants (M0003-R007). Custom roles receive it like any other
capability.

## 5. Concepts And Terminology

| Term           | Meaning                                                                               |
| -------------- | ------------------------------------------------------------------------------------- |
| Snapshot       | The committed file of countries and currencies that the seed loads                    |
| Seed version   | An integer that identifies one snapshot; it increases whenever the snapshot changes   |
| Minor unit     | The number of decimal places a currency uses, from ISO 4217 (USD 2, JPY 0, BHD 3)     |
| Lookup control | A web form field that lets the user pick one country or currency from the served list |

## 6. Functional Requirements

- M0004-R001: The cell must store countries in `reference.countries` with `code` (ISO 3166-1 alpha-2, primary key), `alpha3`, `numeric_code`, and `name`.
- M0004-R002: The cell must store currencies in `reference.currencies` with `code` (ISO 4217 alphabetic, primary key), `numeric_code`, `name`, and `minor_unit`.
- M0004-R003: The cell must record each applied seed in `reference.seed_versions` with `version` and `applied_at`.
- M0004-R004: The repository must hold one snapshot of all current ISO 3166-1 countries and ISO 4217 currencies, and the module must declare its seed version. Changing the snapshot requires a higher version.
- M0004-R005: The module descriptor must provide a `seed` step, which cell provisioning runs (I0003-R009). In one transaction the step must upsert every snapshot row by `code` and record the version. Rerunning the same version must leave the data unchanged.
- M0004-R006: The seed must fail with `SEED_FAILED` if the snapshot is invalid (duplicate code, a code in the wrong format, or a minor unit outside 0 to 4). The whole transaction rolls back.
- M0004-R007: A cell whose `reference.seed_versions` does not contain the declared version must not be ready, with reason `SEED_MISSING`. The runtime cell registry runs this check with its other readiness checks (I0003-R015, R018).
- M0004-R008: The API must serve `GET /api/reference-data/v1/countries` and `GET /api/reference-data/v1/currencies` from the caller's tenant's cell, sorted by `name`.
- M0004-R009: The web app must provide a country lookup control and a currency lookup control. Each loads its list once per session, filters as the user types by name or code, and returns the selected `code`.

## 7. Business Rules And Invariants

- Reference rows have no tenant column; every tenant in a cell sees the same lists (database).
- `nap-app` has `SELECT` only on the `reference` schema (database grant).
- A `code` is never deleted by a later snapshot; a withdrawn code stays so existing records still resolve (seed).
- Other modules store the `code`, not a row ID, and may add a foreign key to it inside the cell (database).

## 8. Lifecycle And State Transitions

| Cell state                       | Event                  | Result                                  |
| -------------------------------- | ---------------------- | --------------------------------------- |
| Migrated, not seeded             | Seed step passes       | Snapshot loaded; version recorded       |
| Migrated, not seeded             | Seed step fails        | Rolled back; provisioning `SEED_FAILED` |
| Seeded at declared version       | Seed step reruns       | No change                               |
| Seed version older than declared | Registry load or `add` | Not ready, `SEED_MISSING`               |

## 9. Data Requirements

All tables are in each cell's `reference` schema, created by this module's
migration before the `app` schema migrates (M0002-01-R004). They have no audit
or soft-delete fields and write no outbox rows, because rows change only
through a versioned seed. The data is public ISO data and not sensitive.

| Table           | Schema object        | Behavior defined by |
| --------------- | -------------------- | ------------------- |
| `countries`     | `countriesSchema`    | R001, R005          |
| `currencies`    | `currenciesSchema`   | R002, R005          |
| `seed_versions` | `seedVersionsSchema` | R003, R007          |

### `reference.countries`

One row per ISO 3166-1 country.

| Column         | Type      | Rules                                                    |
| -------------- | --------- | -------------------------------------------------------- |
| `code`         | `char(2)` | Primary key; uppercase alpha-2, such as `US`; immutable  |
| `alpha3`       | `char(3)` | Not null, unique; uppercase alpha-3, such as `USA`       |
| `numeric_code` | `char(3)` | Not null, unique; three digits with leading zeros, `840` |
| `name`         | `text`    | Not null; English short name                             |

### `reference.currencies`

One row per ISO 4217 currency.

| Column         | Type       | Rules                                                            |
| -------------- | ---------- | ---------------------------------------------------------------- |
| `code`         | `char(3)`  | Primary key; uppercase alphabetic code, such as `USD`; immutable |
| `numeric_code` | `char(3)`  | Not null, unique; three digits with leading zeros, `840`         |
| `name`         | `text`     | Not null; English name                                           |
| `minor_unit`   | `smallint` | Not null; 0 to 4                                                 |

### `reference.seed_versions`

One row per seed version applied to this cell.

| Column       | Type          | Rules                       |
| ------------ | ------------- | --------------------------- |
| `version`    | `integer`     | Primary key; greater than 0 |
| `applied_at` | `timestamptz` | Not null, default `now()`   |

## 10. API Requirements

Base: `/api/reference-data/v1`. Route capabilities omit the tenant part, which I0005 adds.

| Method and route  | Route capability                | Response                                   | Errors |
| ----------------- | ------------------------------- | ------------------------------------------ | ------ |
| `GET /countries`  | `reference-data::lookups::read` | `[{ code, alpha3, numericCode, name }]`    | —      |
| `GET /currencies` | `reference-data::lookups::read` | `[{ code, numericCode, name, minorUnit }]` | —      |

Both routes are read-only and cacheable per session.

## 11. Cross-Module Interactions

- Cell provisioning (I0003) runs the seed step in its seed stage and calls the readiness check through the runtime cell registry.
- I0005 authorizes the lookup routes.
- Setup modules (business directory, companies, tenant settings) store country and currency codes and use the lookup controls.

## 12. Security And Audit

- The API has no write path, and `nap-app` cannot write to `reference` (Section 7).
- The seed runs only as `nap-admin` inside provisioning.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                        | Requirements                       |
| --------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| AC01      | The cell migration creates the three `reference` tables; `nap-app` can read but not write them.                        | M0004-R001, M0004-R002, M0004-R003 |
| AC02      | Provisioning a new cell loads every snapshot row and records the declared version; rerunning the seed changes nothing. | M0004-R004, M0004-R005             |
| AC03      | An invalid snapshot fails the seed with `SEED_FAILED` and leaves no rows.                                              | M0004-R006                         |
| AC04      | A cell missing the declared version is not ready with `SEED_MISSING`; after seeding it becomes ready.                  | M0004-R007                         |
| AC05      | Both routes return the sorted lists to a user with the capability and deny a user without it.                          | M0004-R008                         |
| AC06      | Each lookup control filters by name or code and returns the selected code.                                             | M0004-R009                         |

## 14. Outstanding Questions

None.
