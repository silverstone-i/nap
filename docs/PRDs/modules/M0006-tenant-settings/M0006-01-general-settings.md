# M0006-01: General Settings

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                                                                                                                                         |
| Type                 | Module Work Unit                                                                                                                                                                                                                                                                    |
| Family               | [M0006: Tenant Settings](../M0006-tenant-settings.md)                                                                                                                                                                                                                               |
| Related architecture | [Module map](../../../architecture/module-map.md), [Migrations](../../../architecture/migrations.md)                                                                                                                                                                                |
| Related PRDs         | [M0004: Reference Data](../M0004-reference-data.md), [M0005: Business Directory](../M0005-business-directory.md), [M0006-03: Member Profiles](M0006-03-member-profiles.md), [I0001: Application Entry and Shell](../../inter-module-workflows/I0001-application-entry-and-shell.md) |
| Related decisions    | General settings are one JSON document per tenant, validated by one shared schema that sets each key's default, so a new setting needs no migration (2026-10-25)                                                                                                                    |
| Last reviewed        | 2026-10-25                                                                                                                                                                                                                                                                          |

## 2. Purpose

Each tenant needs to set how nap behaves for it: which country a phone number
without a country code belongs to, which time zone and date format to show,
which currency to use, and how many rows a list shows. This Work Unit stores
those general settings for each tenant, gives every setting a default so a new
tenant works before anyone opens Settings, and lets a tenant administrator
change them on a Settings screen.

## 3. Scope

### Included

- The `app.tenant_settings` table and the shared settings schema.
- The general settings listed in R004 and their defaults.
- Reading and changing the tenant's settings, and reading their effective
  values.
- The Settings → General screen.
- Using the default country for phones (M0005-R046).

### Excluded

- Member overrides and the account-menu Profile screen: M0006-03.
- Applying time zone, date format, and currency to displayed values. Each
  feature that shows dates or amounts applies them in its own PRD.
- Translating the app. `language` holds the tenant's choice among the
  languages nap ships; only English ships today.
- Numbering, payment terms, and approval configuration: later M0006 Work Units.

## 4. Actors And Permissions

| Context                  | Actor                | Required capability                         | Result                                        |
| ------------------------ | -------------------- | ------------------------------------------- | --------------------------------------------- |
| Read stored settings     | Signed-in member     | `<TENANT>::tenant-settings::general::read`  | Returns stored values with defaults filled in |
| Change settings          | Signed-in member     | `<TENANT>::tenant-settings::general::write` | Saves the change                              |
| Read effective settings  | Any signed-in member | None beyond membership                      | Returns the values to apply                   |
| Either without the grant | Signed-in member     | —                                           | Denied by I0005                               |

`tenant_admin` holds both capabilities through `<CODE>::*::*::*`
(M0003-R007). `tenant-settings` is a foundation module, like
`business-directory`: every tenant can use it with no entitlement row.

## 5. Concepts And Terminology

| Term            | Meaning                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| General setting | One named value in the tenant's settings document, such as `timeZone`                                   |
| Settings schema | The one definition, in `packages/shared`, of every general setting's name, allowed values, and default  |
| Schema default  | The value the settings schema gives a setting the tenant has not saved                                  |
| Stored value    | A value the tenant has saved for a setting                                                              |
| Effective value | The value nap applies: the member's override (M0006-03), else the stored value, else the schema default |
| Overridable     | Marked in the settings schema as a setting a member may override for themself                           |
| IANA time zone  | A time zone name from the Internet Assigned Numbers Authority database, such as `America/Chicago`       |

## 6. Functional Requirements

- M0006-01-R001: Each tenant's general settings must be stored as one JSON object in `app.tenant_settings`, holding only the settings the tenant has saved.
- M0006-01-R002: One settings schema in `packages/shared` must define every general setting's name, allowed values, schema default, and whether it is overridable. The API's validation and the web app's display must both use it.
- M0006-01-R003: Adding a general setting must need only a change to the settings schema. Tenants that have not saved it get its schema default.
- M0006-01-R004: The settings schema must define these settings:

  | Setting          | Allowed values                              | Schema default     | Overridable |
  | ---------------- | ------------------------------------------- | ------------------ | ----------- |
  | `defaultCountry` | An M0004 country code                       | `US`               | No          |
  | `currency`       | An M0004 currency code                      | `USD`              | No          |
  | `timeZone`       | An IANA time zone name                      | `America/New_York` | Yes         |
  | `dateFormat`     | `MM/DD/YYYY`, `DD/MM/YYYY`, or `YYYY-MM-DD` | `MM/DD/YYYY`       | Yes         |
  | `language`       | A language nap ships; today only `en`       | `en`               | Yes         |
  | `recordsPerPage` | `25`, `50`, or `100`                        | `25`               | Yes         |

- M0006-01-R005: Reading the tenant's settings must return every setting in the schema, each with its stored value or, when none is stored, its schema default, and say which values are stored.
- M0006-01-R006: A change must name one or more settings with their new values, or `null` to remove a stored value and return to the schema default. An unknown setting or a value the schema does not allow fails with `INVALID_INPUT`, and nothing is saved.
- M0006-01-R007: A country or currency must be a code in M0004's lists, checked when it is saved.
- M0006-01-R008: Any signed-in member of the tenant must be able to read the tenant's effective settings. Until M0006-03 adds member overrides, the effective value is the stored value or the schema default.
- M0006-01-R009: Tenant provisioning and Napsoft tenant setup must create the tenant's `app.tenant_settings` row with no stored values, in the same transaction as the other seeded directory rows (M0005-R022).
- M0006-01-R010: Settings must offer a General screen to members with `tenant-settings::general::read`. It shows every setting with its current value and marks values that are schema defaults. Members with `general::write` can edit and save them, or reset one to its default. Members without it see the values read-only. _Superseded in part by R012 and R013 (read-only values as text; no "Default" caption)._
- M0006-01-R011: The phone rules in M0005 must read `defaultCountry` as the tenant's effective value (M0005-R046).
- M0006-01-R012: A member without `general::write` must see each setting as plain text, with no disabled inputs and no notice that they cannot change it (I0001-R042).
- M0006-01-R013: A setting at its schema default carries no caption. A member with `general::write` sees **Reset to default** only beside a stored value (I0001-R043).

## 7. Business Rules And Invariants

- The database enforces one row per tenant and that `settings` is a JSON object.
- The module domain enforces the settings schema (R004, R006) and the M0004 check (R007) on every write. The database does not check setting names or values, so no write may bypass the domain.
- A setting removed from a later schema version is ignored on read and dropped on the tenant's next save.

## 8. Lifecycle And State Transitions

| State                  | Action                    | Result                                                  |
| ---------------------- | ------------------------- | ------------------------------------------------------- |
| —                      | Tenant provisioned        | Row with no stored values; every setting is its default |
| Setting at its default | Save a value              | Value stored; event written                             |
| Setting stored         | Save another value        | Value replaced; event written                           |
| Setting stored         | Reset to default (`null`) | Stored value removed; event written                     |

## 9. Data Requirements

### `app.tenant_settings`

One row per tenant, with the standard audit fields and `revision`, and no
soft delete. Row-level security (RLS) limits it to the session's tenant.

| Column      | Type      | Rules                                                         |
| ----------- | --------- | ------------------------------------------------------------- |
| `tenant_id` | `uuid`    | Primary key; immutable; RLS column                            |
| `settings`  | `jsonb`   | Not null, default `{}`; a JSON object of stored values (R001) |
| `revision`  | `integer` | Not null, default 1                                           |

## 10. API Requirements

Base: `/api/tenant-settings/v1`. Route capabilities omit the tenant part,
which I0005 adds.

| Method and route | Route capability                  | Errors                            |
| ---------------- | --------------------------------- | --------------------------------- |
| `GET /general`   | `tenant-settings::general::read`  | —                                 |
| `PATCH /general` | `tenant-settings::general::write` | `INVALID_INPUT`, `STALE_REVISION` |
| `GET /effective` | Session with the tenant selected  | —                                 |

- `GET /general` returns `{ settings: { <name>: { value, stored } }, revision }` (R005).
- `PATCH /general` takes `{ settings: { <name>: value | null }, revision }` (R006) and returns the same shape as `GET /general`.
- `GET /effective` returns `{ <name>: value }` for every setting (R008).

## 11. Cross-Module Interactions

- M0004 supplies the country and currency codes and lookup controls (R007, R010).
- M0005 reads `defaultCountry` for phones (R011, M0005-R046).
- I0001's standard grids start at `recordsPerPage` once M0006-03 serves member values.
- I0006 and Napsoft tenant setup create the row (R009).
- Each change writes a `cell.outbox` row in the same transaction; the sync
  worker (I0004) delivers it to admin as a `tenant_settings.updated` event
  with the changed settings' before and after values.

## 12. Security And Audit

- Settings hold no secrets. The event records who changed which settings, with
  before and after values.
- Reading effective values needs only membership, because every screen needs
  them; reading the stored-or-default view and changing it need the
  capabilities in section 4.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                       | Requirements                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| AC01      | A newly provisioned tenant, and the Napsoft tenant, have a settings row with no stored values, and `GET /general` returns every R004 default marked as not stored.                    | M0006-01-R001, R004, R005, R009 |
| AC02      | Saving `timeZone` `America/Chicago` stores it, writes an event, and leaves the other settings at their defaults; resetting it with `null` returns it to `America/New_York`.           | M0006-01-R001, R005, R006       |
| AC03      | An unknown setting, `recordsPerPage` 30, an unknown time zone, an unknown country, and a stale revision are refused, and nothing is saved.                                            | M0006-01-R006, R007             |
| AC04      | A new setting added only to the settings schema appears with its default for every tenant, with no migration.                                                                         | M0006-01-R002, R003             |
| AC05      | A member with no settings capability reads `GET /effective`; `GET /general` and `PATCH /general` are denied to them.                                                                  | M0006-01-R008                   |
| AC06      | The General screen shows defaults as defaults, saves and resets values with `general::write`, and is read-only without it.                                                            | M0006-01-R010                   |
| AC07      | With `defaultCountry` `GB`, a phone entered as `020 7946 0958` is stored as `+442079460958`.                                                                                          | M0006-01-R011, M0005-R046       |
| AC08      | Without `general::write`, the General screen shows every value as text with no notice; no value carries a "Default" caption, and Reset to default appears only beside a stored value. | M0006-01-R012, R013             |

## 14. Outstanding Questions

None.
