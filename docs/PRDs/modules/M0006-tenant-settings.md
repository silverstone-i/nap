# M0006: Tenant Settings

Status: in progress. M0006-01 through M0006-04 are implemented; numbering, payment terms, and approval configuration have no PRD yet. Last updated 2026-10-30.

## Purpose

Business modules need tenant-wide configuration: a default country for phone
numbers, a time zone and date format for display, a currency, a page size for
lists, numbering rules, payment terms, and approval rules. `tenant-settings`
owns that configuration in each tenant's cell (`cell/app`, per the
[module map](../../architecture/module-map.md)), along with each member's
overrides of it, the tenant's file storage, and the tenant logo.

## How settings resolve

A general setting is one key in a JSON document. One shared schema in
`packages/shared` defines every key: its type, its default, and whether a
member may override it. A business module asks for a setting's effective
value, which is the first of:

1. the member's override, when the key allows one (M0006-03);
2. the tenant's stored value (M0006-01);
3. the schema default.

Adding a setting adds a key to the schema. It needs no new column and no
migration, and every tenant gets the schema default until it saves its own
value.

## Tables

All tables are in the `app` schema of each cell and follow the rules for
tenant business tables (M0002-01-R006).

| Table                 | Work Unit | Holds                                                                    |
| --------------------- | --------- | ------------------------------------------------------------------------ |
| `app.tenant_settings` | M0006-01  | One row per tenant: its stored general settings as JSON                  |
| `app.file_storage`    | M0006-02  | One row per tenant: its S3-compatible bucket and encrypted access secret |
| `app.files`           | M0006-02  | One row per stored object: its key, type, size, and purpose              |
| `app.member_profiles` | M0006-03  | One row per tenant membership: its setting overrides and profile image   |

## Work Unit status

| Start order | Work Unit                                                                                         | Required work                                                                                                                                | Tables                            | Status      | Blocker / evidence                                                                                                                                                                                                                                                                                                                                                               |
| ----------: | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|           1 | [M0006-01: General settings](M0006-tenant-settings/M0006-01-general-settings.md)                  | Store the tenant's general settings as validated JSON with schema defaults; Settings → General screen; the phone default country reads it.   | `tenant_settings`                 | Complete    | Verified 2026-10-25: lint, unit, web, shared, and DB tests pass; on a recreated dev stack the General screen saved GB and Europe/London, a phone typed `020 7946 0958` was stored as `+442079460958`, and resetting the country returned it to US                                                                                                                                |
|           2 | [M0006-02: File storage and tenant logo](M0006-tenant-settings/M0006-02-file-storage-and-logo.md) | Configure the tenant's S3-compatible bucket, upload files through the API, serve them by signed link, and show the tenant logo in the shell. | `file_storage`, `files`           | Complete    | Verified 2026-10-25: lint, unit (API 608, web 268, shared 18), and DB (314) tests pass; on a recreated dev stack an Amazon S3 bucket connected after its test, the logo uploaded and showed in the header by a signed link the bucket refused unsigned, replacing it deleted the old object, and disconnecting left the tenant name alone                                        |
|           3 | [M0006-03: Member profiles](M0006-tenant-settings/M0006-03-member-profiles.md)                    | Let each member override allowed settings and choose a profile image; serve each member's effective settings to the web app.                 | `member_profiles` (reads `files`) | Complete    | Verified 2026-10-25: lint, unit (API 608, web 275, shared 20), and DB (321) tests pass; on a recreated dev stack the Profile screen set a default image shown on the account button, a time zone override showed beside the tenant value and Use tenant setting removed it, and choosing 100 rows in one grid saved to the profile so another grid started at 100 after a reload |
|           4 | [M0006-04: Light and dark logos](M0006-tenant-settings/M0006-04-light-and-dark-logos.md)          | Store a light-theme and a dark-theme logo, move the existing logo to light, and show the logo matching the current theme.                    | `files`                           | Not started | PRD drafted 2026-10-30; not yet accepted                                                                                                                                                                                                                                                                                                                                         |

Numbering, payment terms, and approval configuration are later Work Units.
They have no PRD yet and get start orders when they are drafted.

## Status Tracking

- `Not started`: implementation has not begun.
- `In progress`: implementation or verification is underway.
- `Blocked`: record the decision or dependency preventing progress.
- `Complete`: the accepted PRD's requirements pass verification; record the evidence.

Update a row when its progress changes. Accept each Work Unit's PRD before
implementing it.

## Out of scope

- Login-level preferences that follow a person across tenants. A member's
  profile belongs to one tenant membership (M0006-03).
- Legal entities and tax registrations: Companies (roadmap 21).
- Country and currency lists: [M0004: Reference Data](M0004-reference-data.md).
- Storage provided by NapSoft. Each tenant brings its own bucket (M0006-02).
