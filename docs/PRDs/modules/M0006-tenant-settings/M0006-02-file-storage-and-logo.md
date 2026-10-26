# M0006-02: File Storage and Tenant Logo

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Status               | Implemented                                                                                                                                                                                                                                                                                |
| Type                 | Module Work Unit                                                                                                                                                                                                                                                                           |
| Family               | [M0006: Tenant Settings](../M0006-tenant-settings.md)                                                                                                                                                                                                                                      |
| Related architecture | [Module map](../../../architecture/module-map.md)                                                                                                                                                                                                                                          |
| Related PRDs         | [M0006-01: General Settings](M0006-01-general-settings.md), [M0006-03: Member Profiles](M0006-03-member-profiles.md), [M0005: Business Directory](../M0005-business-directory.md), [I0001: Application Entry and Shell](../../inter-module-workflows/I0001-application-entry-and-shell.md) |
| Related decisions    | nap is open source and NapSoft hosts no files: each tenant brings its own S3-compatible bucket, files are uploaded through nap, and the bucket stays private (2026-10-25)                                                                                                                  |
| Last reviewed        | 2026-10-25                                                                                                                                                                                                                                                                                 |

## 2. Purpose

Tenants want their logo in the app and their people's pictures on their
profiles. nap is open source, so it stores no files of its own: each tenant
connects a bucket it controls on any S3-compatible service, such as Amazon
S3, Cloudflare R2, Backblaze B2, or a self-hosted MinIO. This Work Unit lets a
tenant administrator connect that bucket, uploads files to it through the
API, serves them without making the bucket public, and uses it for the tenant
logo. Member profile images (M0006-03) use the same storage.

## 3. Scope

### Included

- The tenant's storage connection, with an encrypted secret and a connection test.
- Uploading files through the API, and the `app.files` record of each one.
- Viewing a stored file by a short-lived signed link.
- The tenant logo: uploading, replacing, and removing it, and showing it in the
  application shell.
- What the app does with no storage connected, or with storage failing.

### Excluded

- Storage provided by NapSoft.
- Member profile images, which use this storage: M0006-03.
- Attachments on business records, such as documents on a vendor. Later PRDs
  add file purposes to R007.
- Rotating the encryption key.

## 4. Actors And Permissions

| Context                         | Actor                | Required capability                         | Result                                      |
| ------------------------------- | -------------------- | ------------------------------------------- | ------------------------------------------- |
| Read the storage connection     | Signed-in member     | `<TENANT>::tenant-settings::storage::read`  | Returns it without the secret               |
| Connect, change, or disconnect  | Signed-in member     | `<TENANT>::tenant-settings::storage::write` | Tests and saves, or removes, the connection |
| Upload, replace, or remove logo | Signed-in member     | `<TENANT>::tenant-settings::general::write` | Changes the logo                            |
| View the logo                   | Any signed-in member | None beyond membership                      | Gets a signed link                          |
| Any of the above without grant  | Signed-in member     | —                                           | Denied by I0005                             |

`tenant_admin` holds every capability through `<CODE>::*::*::*` (M0003-R007).

## 5. Concepts And Terminology

| Term                  | Meaning                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| S3-compatible service | A file storage service that accepts the Amazon S3 programming interface                                                |
| Bucket                | A named container of files on that service                                                                             |
| Storage connection    | The endpoint, region, bucket, access key ID, and secret access key nap uses to reach the tenant's bucket               |
| Secret access key     | The password half of the bucket's access key; it is never shown back                                                   |
| Object                | One stored file in the bucket                                                                                          |
| Signed link           | A link to one object that carries a time-limited signature, so the browser can fetch it although the bucket is private |
| File purpose          | Why a file is stored, which sets its allowed types and size: `logo` here, `profile_image` in M0006-03                  |

## 6. Functional Requirements

### Storage connection

- M0006-02-R001: A tenant must have at most one storage connection, stored in `app.file_storage`: an `https` endpoint, a region, a bucket name, an access key ID, and the secret access key.
- M0006-02-R002: The secret access key must be stored only encrypted, with AES-256-GCM (Advanced Encryption Standard in Galois/Counter Mode), a fresh random nonce per write, and the tenant ID bound to the ciphertext, so a copied value fails to decrypt for another tenant. The key comes from the deploy secret `FILE_STORAGE_ENCRYPTION_KEY_<ENV>`, is never stored in a database, and does not rotate. The API must refuse to start without it.
- M0006-02-R003: No response, log, outbox row, or event may contain the secret access key. Responses say only whether one is set.
- M0006-02-R004: Saving a connection must first test it by writing, reading back, and deleting a small object. A failed test saves nothing and fails with `STORAGE_TEST_FAILED`, giving one reason: `UNREACHABLE`, `ACCESS_DENIED`, `BUCKET_NOT_FOUND`, or `UNEXPECTED_RESPONSE`.
- M0006-02-R005: Changing a connection without entering a secret must keep the stored secret. Changing the endpoint or access key ID must require the secret again.
- M0006-02-R006: Disconnecting storage must delete the connection. Files already in the bucket stay there and are not deleted by nap; their records stay, and the app shows the R014 fallbacks until storage is connected again.

### Files

- M0006-02-R007: Every stored object must have a row in `app.files` with its purpose, object key, content type, size, and uploader. Each purpose allows only PNG, JPEG, WebP, or GIF images up to 2 MB.
- M0006-02-R008: Files must be uploaded to the API, which checks the file's content against its declared type, enforces R007, and writes the object. The browser never writes to the bucket.
- M0006-02-R009: nap must name each object `<tenant_id>/<purpose>/<file_id>`. A file name the browser sends is never used in a key.
- M0006-02-R010: Viewing a file must return a signed link to its object, valid for at most 15 minutes. The bucket needs no public access.
- M0006-02-R011: When a file is replaced or removed, its object must be deleted from the bucket and its row archived. A failed bucket deletion must not fail the change; it is logged with the object key for later cleanup.
- M0006-02-R012: With no storage connected, an upload fails with `STORAGE_NOT_CONFIGURED`. With storage failing, an upload or a signed link fails with `STORAGE_UNAVAILABLE`.

### Tenant logo

- M0006-02-R013: A member with `general::write` must be able to upload, replace, and remove the tenant logo on the Settings → General screen. The upload control appears only when storage is connected.
- M0006-02-R014: The application shell must show the tenant logo next to the selected tenant's name. With no logo, no storage, or storage failing, it shows the tenant name alone, and the page still loads.

### Screen

- M0006-02-R015: Settings must offer a Storage screen to members with `storage::read`. It shows the connection without the secret, and lets members with `storage::write` connect, test, change, or disconnect it.
- M0006-02-R016: Disconnecting storage must confirm through the shared confirmation dialog with the title "Disconnect storage?" and the one sentence "Files stay in the bucket." Removing the logo confirms with "Remove logo?" and no text (I0001-R039).
- M0006-02-R017: A member without `storage::write` must see the connection as plain text, or "No file storage is connected." when there is none, with no disabled inputs and no notice that they cannot change it (I0001-R042).
- M0006-02-R018: The Storage and logo controls must not explain themselves (I0001-R043). The Storage screen has no introduction, the region has no helper text, and a saved secret shows as the placeholder "Saved" in its field. The secret field says "Enter the secret again." only when R005 requires it. The logo control states the allowed types and size only in the error for a refused file.

## 7. Business Rules And Invariants

- The database enforces one connection per tenant, one active logo per tenant, the `https` endpoint, and the file purposes and size limit.
- The module domain enforces the content check (R008), key naming (R009), the connection test before saving (R004), and the secret rules (R002, R003, R005).

## 8. Lifecycle And State Transitions

| State         | Action               | Result                                                      |
| ------------- | -------------------- | ----------------------------------------------------------- |
| Not connected | Connect, test passes | Connected; event written                                    |
| Not connected | Connect, test fails  | Still not connected; `STORAGE_TEST_FAILED`                  |
| Connected     | Change, test passes  | Changed; event written                                      |
| Connected     | Disconnect           | Not connected; files stay in the bucket; event written      |
| No logo       | Upload logo          | Logo shown in the shell; event written                      |
| Logo          | Replace or remove    | Old object deleted (R011); new logo or the name alone shown |

## 9. Data Requirements

All tables are in each tenant's cell in the `app` schema, with the standard
audit fields and `revision`. Row-level security (RLS) limits each to the session's tenant through `tenant_id`.

### `app.file_storage`

One row per connected tenant. No soft delete; disconnecting deletes the row.

| Column             | Type   | Rules                                                                |
| ------------------ | ------ | -------------------------------------------------------------------- |
| `tenant_id`        | `uuid` | Primary key; immutable; RLS column                                   |
| `endpoint`         | `text` | Not null; an `https` URL                                             |
| `region`           | `text` | Not null                                                             |
| `bucket`           | `text` | Not null                                                             |
| `access_key_id`    | `text` | Not null                                                             |
| `secret_encrypted` | `text` | Not null; Base64 of nonce, authentication tag, and ciphertext (R002) |

### `app.files`

One row per stored object, with soft delete.

| Column         | Type      | Rules                                                             |
| -------------- | --------- | ----------------------------------------------------------------- |
| `id`           | `uuid`    | Primary key; immutable                                            |
| `tenant_id`    | `uuid`    | Not null; immutable; RLS column                                   |
| `purpose`      | `text`    | Not null; `logo` or `profile_image`; immutable                    |
| `object_key`   | `text`    | Not null; immutable; unique per tenant (R009)                     |
| `content_type` | `text`    | Not null; `image/png`, `image/jpeg`, `image/webp`, or `image/gif` |
| `size_bytes`   | `integer` | Not null; 1 to 2,097,152                                          |

At most one active `logo` row per tenant.

## 10. API Requirements

Base: `/api/tenant-settings/v1`.

| Method and route      | Route capability                  | Errors                                                           |
| --------------------- | --------------------------------- | ---------------------------------------------------------------- |
| `GET /storage`        | `tenant-settings::storage::read`  | —                                                                |
| `PUT /storage`        | `tenant-settings::storage::write` | `INVALID_INPUT`, `STORAGE_TEST_FAILED`, `STALE_REVISION`         |
| `DELETE /storage`     | `tenant-settings::storage::write` | `STALE_REVISION`                                                 |
| `PUT /logo`           | `tenant-settings::general::write` | `INVALID_INPUT`, `STORAGE_NOT_CONFIGURED`, `STORAGE_UNAVAILABLE` |
| `DELETE /logo`        | `tenant-settings::general::write` | `NOT_FOUND`                                                      |
| `GET /files/:id/link` | Session with the tenant selected  | `NOT_FOUND`, `STORAGE_NOT_CONFIGURED`, `STORAGE_UNAVAILABLE`     |

- `GET /storage` returns the connection with `secretSet: true` in place of the secret, or `null` (R003).
- `PUT /logo` takes the image as `multipart/form-data` (R008).
- `GET /files/:id/link` returns `{ url, expiresAt }` (R010).
- `GET /effective` (M0006-01) also returns `logoFileId`, or `null`, so the shell can request the logo's link.

## 11. Cross-Module Interactions

- I0001's shell shows the logo (R014), which I0001-R011 deferred to a later
  server contract.
- M0006-03 stores profile images with this storage.
- Each change to the connection or the logo writes a `cell.outbox` row; the
  sync worker (I0004) delivers it to admin as a `tenant_settings.storage_connected`,
  `storage_changed`, `storage_disconnected`, or `logo_changed` event.

## 12. Security And Audit

- The secret is encrypted at rest, bound to the tenant, and never returned or
  recorded (R002, R003). Events name who changed the connection and which
  fields changed.
- Object keys never contain user-supplied names (R009), and the API checks
  file content, not only the declared type (R008).
- The bucket stays private; signed links expire within 15 minutes (R010).
- nap reaches only the endpoint the tenant administrator entered.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                                                                                                                    | Requirements              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| AC01      | Connecting a reachable bucket tests it, saves it, and stores the secret only encrypted; the API does not start without the encryption key.                                                         | M0006-02-R001, R002, R004 |
| AC02      | No response, log, outbox row, or event contains the secret; `GET /storage` shows `secretSet: true`.                                                                                                | M0006-02-R003             |
| AC03      | A wrong key, a missing bucket, and an unreachable endpoint each fail with `STORAGE_TEST_FAILED` and the matching reason, and nothing is saved.                                                     | M0006-02-R004             |
| AC04      | Changing the region without a secret keeps the secret; changing the access key ID without one is refused.                                                                                          | M0006-02-R005             |
| AC05      | Uploading a 1 MB PNG logo stores it under `<tenant_id>/logo/<file_id>`; a 3 MB image, a text file named `.png`, and an upload with no storage are refused.                                         | M0006-02-R007–R009, R012  |
| AC06      | The logo's link fetches the image and stops working after it expires; the bucket allows no anonymous read.                                                                                         | M0006-02-R010             |
| AC07      | Replacing the logo deletes the old object; a failed deletion still saves the new logo and logs the key.                                                                                            | M0006-02-R011             |
| AC08      | The shell shows the logo; with no logo, after disconnecting, or with storage down, it shows the tenant name and the page loads.                                                                    | M0006-02-R006, R014       |
| AC09      | The Storage screen shows the connection without the secret, is read-only without `storage::write`, and the logo control appears only when connected.                                               | M0006-02-R013, R015       |
| AC10      | Disconnect asks "Disconnect storage?" and Remove logo asks "Remove logo?", each through the shared confirmation dialog.                                                                            | M0006-02-R016             |
| AC11      | Without `storage::write`, the connection shows as text with no notice; the screen has no introduction or helper text, except "Enter the secret again." when the endpoint or access key ID changed. | M0006-02-R017, R018       |

## 14. Outstanding Questions

None.
