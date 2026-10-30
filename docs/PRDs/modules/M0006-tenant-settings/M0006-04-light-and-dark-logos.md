# M0006-04: Light and Dark Logos

## 1. Document Control

| Field                | Value                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status               | Implemented                                                                                                                                                                          |
| Type                 | Module Work Unit                                                                                                                                                                     |
| Family               | [M0006: Tenant Settings](../M0006-tenant-settings.md)                                                                                                                                |
| Related architecture | [Module map](../../../architecture/module-map.md)                                                                                                                                    |
| Related PRDs         | [M0006-02: File Storage and Tenant Logo](M0006-02-file-storage-and-logo.md), [I0001: Application Entry and Shell](../../inter-module-workflows/I0001-application-entry-and-shell.md) |
| Related decisions    | A tenant keeps one logo for the light theme and one for the dark theme; with only one uploaded, both themes use it; the existing logo becomes the light-theme logo (2026-10-30)      |
| Last reviewed        | 2026-10-30                                                                                                                                                                           |

## 2. Purpose

A logo drawn for a light background is often unreadable on a dark one, and
the reverse. M0006-02 stores one tenant logo and shows it in both themes.
This Work Unit stores a light-theme logo and a dark-theme logo, and the shell
shows the one that matches the member's current theme.

## 3. Scope

### Included

- Uploading, replacing, and removing each of the two logos on Settings → General.
- Moving each tenant's existing logo to the light-theme logo.
- Choosing the logo the shell shows from the current theme.

### Excluded

- Storage connection, upload checks, object naming, signed links, and object
  deletion, which stay as M0006-02 defines them.
- Logos on the sign-in screen, which comes before a tenant is selected.
- Favicons and email branding.

## 4. Actors And Permissions

| Context                              | Actor                | Required capability                         | Result             |
| ------------------------------------ | -------------------- | ------------------------------------------- | ------------------ |
| Upload, replace, or remove a logo    | Signed-in member     | `<TENANT>::tenant-settings::general::write` | Changes that logo  |
| View the logo for the current theme  | Any signed-in member | None beyond membership                      | Gets a signed link |
| Change a logo without the capability | Signed-in member     | —                                           | Denied by I0005    |

## 5. Concepts And Terminology

| Term          | Meaning                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Logo variant  | Which theme a logo is for: `light` or `dark`                                                                |
| Current theme | The theme the web app is drawing: the member's Light or Dark choice, or the operating system's under System |
| Shown logo    | The logo the shell displays after applying the R005 fallback                                                |

## 6. Functional Requirements

### Storage

- M0006-04-R001: `app.files` must allow the purposes `logo_light` and `logo_dark` in place of `logo`, with at most one active row per tenant for each.
- M0006-04-R002: Existing cells must have every `logo` row, active or archived, changed to `logo_light` by a one-time update. Object keys do not change, so existing objects stay under `<tenant_id>/logo/<file_id>`; new uploads use `<tenant_id>/logo_light/<file_id>` or `<tenant_id>/logo_dark/<file_id>` (M0006-02-R009).
- M0006-04-R003: Each variant must follow M0006-02-R007 through R012 on its own: replacing or removing one logo deletes only that logo's object.

### Shell

- M0006-04-R004: The shell must show the logo for the current theme, and switch it when the theme changes, including an operating-system change under System, without a reload.
- M0006-04-R005: When only one variant is uploaded, the shell must show it in both themes. With neither, no storage, or storage failing, M0006-02-R014 applies.

### Screen

- M0006-04-R006: The Logo section of Settings → General must show two items, "Light theme" and "Dark theme", each with its own preview and its own Upload, Replace, and Remove controls. Each preview sits on that theme's background color, so the member sees the logo as the shell will draw it.
- M0006-04-R007: Removing a logo must confirm through the shared confirmation dialog with the title "Remove light theme logo?" or "Remove dark theme logo?" and no text (I0001-R039).
- M0006-04-R008: The controls appear only when storage is connected and the member has `general::write` (M0006-02-R013). They do not explain the fallback (I0001-R043).

## 7. Business Rules And Invariants

- The database enforces the purposes and one active logo per variant per tenant.
- The web app applies the R005 fallback; the API returns each variant as stored.

## 8. Lifecycle And State Transitions

| State             | Action       | Result                                                      |
| ----------------- | ------------ | ----------------------------------------------------------- |
| No logos          | Upload light | Light logo shown in both themes; event written              |
| Light only        | Upload dark  | Each theme shows its own logo; event written                |
| Light and dark    | Remove dark  | Light logo shown in both themes; dark object deleted; event |
| One logo          | Remove it    | Tenant name alone (M0006-02-R014); object deleted; event    |
| Logo of a variant | Replace it   | Old object of that variant deleted (M0006-02-R011); event   |

## 9. Data Requirements

### `app.files`

| Column    | Change                                                                      |
| --------- | --------------------------------------------------------------------------- |
| `purpose` | Allowed values become `logo_light`, `logo_dark`, and `profile_image` (R001) |

The partial unique index on `tenant_id` for active `logo` rows is replaced by
one on `(tenant_id, purpose)` for active `logo_light` and `logo_dark` rows.
The `001-tenant-settings` baseline is edited to the new check and index. A
one-time update brings existing cells in line: it drops the old check and
index, updates the rows (R002), adds the new ones, and stores the baseline's
new checksum.

## 10. API Requirements

Base: `/api/tenant-settings/v1`.

| Method and route        | Route capability                  | Errors                                                           |
| ----------------------- | --------------------------------- | ---------------------------------------------------------------- |
| `PUT /logo/:variant`    | `tenant-settings::general::write` | `INVALID_INPUT`, `STORAGE_NOT_CONFIGURED`, `STORAGE_UNAVAILABLE` |
| `DELETE /logo/:variant` | `tenant-settings::general::write` | `NOT_FOUND`                                                      |

- `:variant` is `light` or `dark`. `DELETE` with any other value fails with
  `NOT_FOUND`; `PUT` with a file to any other value fails with
  `UNSUPPORTED_MEDIA_TYPE`, because only the two variant paths take uploads.
- `PUT /logo/:variant` returns `{ logoFileId }`.
- `PUT /logo` and `DELETE /logo` are removed.
- `GET /effective` returns `logoLightFileId` and `logoDarkFileId`, each a file
  ID or `null`, in place of `logoFileId`.

## 11. Cross-Module Interactions

- I0001's shell reads the current theme from its display-mode preference
  (I0001-R011, R012) to pick the logo (R004).
- The `tenant_settings.logo_changed` event gains `variant`: `light` or `dark`.
  It is still written to `cell.outbox` and delivered to admin by I0004.

## 12. Security And Audit

Unchanged from M0006-02: uploads are checked by content, object keys carry no
user-supplied names, and signed links expire within 15 minutes. Each logo
change event names who made it and which variant changed.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                             | Requirements        |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| AC01      | After the one-time update, a tenant's existing logo is its light logo, its object key is unchanged, and it still shows in the shell.                        | M0006-04-R001, R002 |
| AC02      | A second active `logo_dark` row for one tenant is refused by the database; a `logo` row is refused.                                                         | M0006-04-R001       |
| AC03      | Uploading a dark logo stores it under `<tenant_id>/logo_dark/<file_id>`; replacing it deletes only the old dark object, and the light logo is untouched.    | M0006-04-R002, R003 |
| AC04      | With both logos, Light shows the light logo and Dark the dark one; under System, changing the operating-system appearance swaps the logo without a reload.  | M0006-04-R004       |
| AC05      | With only a dark logo, Light theme shows it; with only a light logo, Dark theme shows it; with neither, the tenant name shows alone.                        | M0006-04-R005       |
| AC06      | Settings → General shows "Light theme" and "Dark theme" items, each previewed on its theme's background, and each removal asks its own confirmation title.  | M0006-04-R006, R007 |
| AC07      | `PUT /logo/dark` returns `{ logoFileId }`, `DELETE /logo/blue` fails with `NOT_FOUND`, and `GET /effective` returns `logoLightFileId` and `logoDarkFileId`. | M0006-04-R003       |
| AC08      | Each logo change reaches admin as a `tenant_settings.logo_changed` event with its `variant`.                                                                | M0006-04-R003       |

## 14. Outstanding Questions

None.
