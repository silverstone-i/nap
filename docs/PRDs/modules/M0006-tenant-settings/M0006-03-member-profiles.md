# M0006-03: Member Profiles

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                                                                                                                                                       |
| Type                 | Module Work Unit                                                                                                                                                                                                                                                                                  |
| Family               | [M0006: Tenant Settings](../M0006-tenant-settings.md)                                                                                                                                                                                                                                             |
| Related architecture | [Module map](../../../architecture/module-map.md)                                                                                                                                                                                                                                                 |
| Related PRDs         | [M0006-01: General Settings](M0006-01-general-settings.md), [M0006-02: File Storage and Tenant Logo](M0006-02-file-storage-and-logo.md), [M0002: Cell Tenancy](../M0002-cell-tenancy.md), [I0001: Application Entry and Shell](../../inter-module-workflows/I0001-application-entry-and-shell.md) |
| Related decisions    | A profile belongs to one tenant membership and lives in that tenant's cell, so its image is stored in that tenant's bucket; a person in two tenants has two profiles (2026-10-25)                                                                                                                 |
| Last reviewed        | 2026-10-25                                                                                                                                                                                                                                                                                        |

## 2. Purpose

People want the app to suit them: their own time zone, date format, and list
length, and a picture next to their name. This Work Unit gives each member of
a tenant a profile that overrides the tenant's overridable general settings
and holds a profile image, either one of the default images nap ships or one
uploaded to the tenant's storage. It also serves each member's effective
settings to the web app, so screens apply them.

## 3. Scope

### Included

- The `app.member_profiles` table.
- Member overrides of overridable general settings, and effective values that
  apply them.
- The profile image: a default image, an uploaded image, or none.
- The account-menu Profile screen and the profile image in the shell.
- Starting standard grids at the member's `recordsPerPage`.

### Excluded

- Editing another member's profile.
- A profile that follows a login across tenants.
- Display names, signatures, and contact details, which stay on the member's
  directory record (M0005).

## 4. Actors And Permissions

| Context                         | Actor                | Required capability    | Result                             |
| ------------------------------- | -------------------- | ---------------------- | ---------------------------------- |
| Read or change own profile      | Any signed-in member | None beyond membership | Reads or saves their own profile   |
| Read another member's image     | Any signed-in member | None beyond membership | Gets a signed link (M0006-02-R010) |
| Change another member's profile | Anyone               | —                      | No route exists                    |

## 5. Concepts And Terminology

| Term          | Meaning                                                                                 |
| ------------- | --------------------------------------------------------------------------------------- |
| Member        | A login's active membership in the selected tenant (`cell.tenant_members`)              |
| Profile       | A member's overrides and profile image in one tenant                                    |
| Override      | A member's own value for an overridable general setting (M0006-01-R004)                 |
| Default image | One of the animated GIF images that ship with the web app, named in the settings schema |
| Initials      | The member's first and last initials, shown when the member has no profile image        |

## 6. Functional Requirements

- M0006-03-R001: Each member must have at most one profile, stored in `app.member_profiles` and keyed to the member's `cell.tenant_members` row. A profile is created the first time the member saves one.
- M0006-03-R002: A member must be able to override only settings the settings schema marks overridable (M0006-01-R004). An override must be a value the schema allows; `null` removes it. Any other setting or value fails with `INVALID_INPUT`, and nothing is saved.
- M0006-03-R003: `GET /effective` (M0006-01-R008) must return, for each setting, the member's override, else the tenant's stored value, else the schema default.
- M0006-03-R004: A member must be able to choose a profile image: one of the default images, an image uploaded through M0006-02 with purpose `profile_image`, or none. The settings schema names the default images. The upload choice appears only when the tenant's storage is connected.
- M0006-03-R005: Replacing or removing an uploaded profile image must delete the old file as M0006-02-R011 describes.
- M0006-03-R006: The account menu must offer Profile, which shows each overridable setting with the tenant's value and the member's override, if any, and the profile image. Choosing "Use tenant setting" removes an override.
- M0006-03-R007: The shell's account button must show the member's profile image, else their initials. With storage failing, an uploaded image falls back to initials and the page still loads.
- M0006-03-R008: A standard grid must start at the member's effective `recordsPerPage`. Choosing another page size in a grid must save it as the member's override, so it applies in every standard grid and every browser.

## 7. Business Rules And Invariants

- The database enforces one profile per membership, that an uploaded image references a `profile_image` file of the same tenant, and that a profile has at most one of a default image or an uploaded image.
- The module domain enforces the override rules (R002) against the settings schema on every write.
- A member reads and writes only their own profile; the API takes the member from the session, never from the request.

## 8. Lifecycle And State Transitions

| State           | Action                       | Result                                                |
| --------------- | ---------------------------- | ----------------------------------------------------- |
| No profile      | Save an override or image    | Profile created                                       |
| Profile         | Save or remove an override   | Effective values change on the next read              |
| Uploaded image  | Choose another image or none | Old file deleted (R005)                               |
| Membership ends | —                            | Profile kept with the membership row; no longer shown |

## 9. Data Requirements

### `app.member_profiles`

One row per member who has saved a profile, in each tenant's cell, with the
standard audit fields and `revision`. Row-level security (RLS) limits it to the session's tenant through `tenant_id`.

| Column          | Type    | Rules                                                                |
| --------------- | ------- | -------------------------------------------------------------------- |
| `membership_id` | `uuid`  | Primary key; the member's `cell.tenant_members.id`; immutable        |
| `tenant_id`     | `uuid`  | Not null; immutable; RLS column                                      |
| `overrides`     | `jsonb` | Not null, default `{}`; overridable settings only (R002)             |
| `default_image` | `text`  | Nullable; a default image name from the settings schema              |
| `image_file_id` | `uuid`  | Nullable; references an `app.files` row with purpose `profile_image` |

`default_image` and `image_file_id` are never both set.

## 10. API Requirements

Base: `/api/tenant-settings/v1`.

| Method and route        | Route capability                 | Errors                                                           |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------- |
| `GET /profile`          | Session with the tenant selected | —                                                                |
| `PATCH /profile`        | Session with the tenant selected | `INVALID_INPUT`, `STALE_REVISION`                                |
| `PUT /profile/image`    | Session with the tenant selected | `INVALID_INPUT`, `STORAGE_NOT_CONFIGURED`, `STORAGE_UNAVAILABLE` |
| `DELETE /profile/image` | Session with the tenant selected | `NOT_FOUND`                                                      |

- `GET /profile` returns `{ overrides, defaultImage, imageFileId, revision }`, with `revision` `0` before the profile exists.
- `PATCH /profile` takes `{ overrides?: { <name>: value | null }, defaultImage?: name | null, revision }`. Setting `defaultImage` removes an uploaded image.
- `PUT /profile/image` takes the image as `multipart/form-data` (M0006-02-R008) and clears `defaultImage`.
- `GET /effective` also returns `profileImage`: `{ defaultImage }`, `{ fileId }`, or `null`.

## 11. Cross-Module Interactions

- Reads the member from `cell.tenant_members` (M0002) through the session's
  membership.
- Uses M0006-02 for uploading, linking, and deleting images.
- I0001's shell shows the image (R007), which I0001-R011 deferred, and I0001's
  standard grids start at the member's page size (R008), replacing the
  browser-local page size of I0001-R012 and R015.

## 12. Security And Audit

- A member can read and change only their own profile (section 7).
- Profile images use M0006-02's checks, private bucket, and signed links.
- Profile changes write no administrative event; they are the member's own
  preferences. Uploaded and deleted files are recorded in `app.files`.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                          | Requirements              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| AC01      | A member with no profile gets the tenant's values from `GET /effective`; after overriding `timeZone`, they get their own value and other members still get the tenant's. | M0006-03-R001, R003       |
| AC02      | Overriding `defaultCountry` or `currency`, or `recordsPerPage` 30, is refused; removing an override returns the tenant's value.                                          | M0006-03-R002, R003       |
| AC03      | A member chooses a default image, then uploads an image, then removes it; each choice shows in the account button, and the uploaded file's object is deleted on removal. | M0006-03-R004, R005, R007 |
| AC04      | With no storage connected, the upload choice is hidden and default images still work; with storage down, an uploaded image falls back to initials.                       | M0006-03-R004, R007       |
| AC05      | The Profile screen shows tenant values beside the member's overrides, and "Use tenant setting" removes an override.                                                      | M0006-03-R006             |
| AC06      | Grids start at the member's `recordsPerPage`; choosing 100 in one grid makes every standard grid start at 100 in another browser.                                        | M0006-03-R008             |
| AC07      | A member cannot read or change another member's profile through any route.                                                                                               | M0006-03-R001             |

## 14. Outstanding Questions

None.
