# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries accumulate under `## [Unreleased]`. Release automation promotes them
when a pull request with a release label merges into `main`.

## [Unreleased]

### Added

- Pull requests to `main` and `dev` get a Claude Code review: the new `Claude Code Review` workflow runs the bundled `/code-review` at medium effort when a PR is opened, reopened, or marked ready, and posts findings as inline review threads, so `/ship review`, `/ship fix`, and Auto-fix handle them like Copilot's. It needs an `ANTHROPIC_API_KEY` repository secret, skips drafts and fork PRs, and reviews once per PR; close and reopen the PR to review its latest commit after large changes.

## [v0.36.0] - 2026-10-29

### Added

- Saving an email, phone, or address that another record in the tenant already holds now warns first (M0005-R065–R067). The dialog lists each record as "Also on:" with its name, kind, organization for an organization contact, and "Archived" where it applies, each with an **Open** link; the button becomes **Save anyway**, and sharing is still allowed. Matching follows R063 (stored email and phone, case-insensitive address). The new `POST /api/business-directory/v1/parties/:id/matches` takes the value in the body and returns up to 20 matches; it requires `business-directory::directory::write` and `business-directory::directory::read`. Lookup indexes on `app.contact_methods (type, value)` and the address match key are added in place in baseline migration `001-business-directory`. Recreate existing cell databases.

## [v0.35.2] - 2026-10-29

### Added

- A record can no longer hold the same email, phone, or address twice (M0005-R063, R064). Emails and phones match on their saved form, so `Pat@Example.com` matches `pat@example.com` and `212.555.1234` matches `(212) 555-1234`; addresses match when every field is equal ignoring case, with empty fields counting as equal. Adding or editing one that matches fails with `409 DUPLICATE_DETAIL`, and the dialog says "This record already has this email." (or phone, or address). Removed ones don't count, and different records may share any of them. Address fields are now saved with runs of whitespace reduced to one space. New unique indexes on `app.contact_methods` and `app.addresses` are added in place in baseline migration `001-business-directory`. Recreate existing cell databases.

## [v0.35.1] - 2026-10-28

### Changed

- Tax ID and phone fields format as you type. A tax ID is laid into its format's mask (`333224444` reads `333-22-4444`) in **New** record dialogs and **Edit tax ID**, characters that fit no slot are dropped, and choosing another format moves the typed characters into the new mask when it can hold them all. A phone in **New phone** and **Edit phone** formats for the tenant's default country (`2125` reads `(212) 5`) and keeps a trailing `x` or `ext.` extension of up to 10 digits; text with other letters, such as a pasted `Tel: 212 555 1234`, is left as typed for validation to flag. The caret stays after the character typed, and backspace or delete next to a `-` or `)` removes the digit beside it.

## [v0.35.0] - 2026-10-27

### Added

- Sessions shows a Browser column, such as "Chrome on macOS", and marks the caller's own row with a green "This browser" dot (M0001-14-R001–R007). Each sign-in stores its `User-Agent`, capped at 512 characters, in the new `admin.sessions.user_agent` column, added in place in baseline migration `001-admin-tenancy`; the API returns only the derived label. Sessions from before the change show "—". Recreate existing admin databases.

## [v0.34.2] - 2026-10-27

### Fixed

- `app` tables no longer use `FORCE ROW LEVEL SECURITY` (M0002-01-R006). The owner, `nap-admin`, now reads and writes every tenant's rows without setting `nap.tenant_id`; `nap-app` is still limited to the current tenant. Code running as `nap-admin` names the tenant explicitly, including the label and tax ID format seeds. Schema verification now fails if any `app` or `reference` table is forced.

## [v0.34.1] - 2026-10-26

### Fixed

- A pencil dialog that fails `STALE_REVISION` now refills from the reloaded record: Edit name on a directory record, and Edit name and Edit grants on a role. Edit portal access refills only when the other change touched access or roles, and Edit tax ID keeps the typed value, since the stored one is never shown. Before, the form kept its old values and took the new revision, so the next Save overwrote the other change. The directory list behind the dialog also refreshes.
- A wrong current password on **Change password** shows "Current password is incorrect." instead of signing the browser out. The API answers `UNAUTHENTICATED` for both a wrong current password and an ended session, so the web app now checks the session before ending it; if that check fails for another reason, the page reports that failure.

## [v0.34.0] - 2026-10-26

### Changed

- A directory record and a role are edited only from their detail dialog (I0001-R035–R038, M0005-R049, M0003-R019). Pencils change the name, the tax ID, and portal access with roles, each in its own small dialog; the footer **Edit** and the separate edit form are gone, and a row's ⋮ **Edit** opens the detail.
- Creating a record or a role asks only for what it needs (M0005-R050, M0003-R020): an employee's name and email, a vendor's legal name and tax ID, a client's legal name and one tax source, a contact's name, or a role's code and name. The new record opens on save, and **New contact** opens the new contact.
- An organization contact's detail shows **Primary contact** and **Billing contact** as switches, and a client contact can be made the primary tax contact from it (M0005-R051). The contacts grid's "Role" column is now **Contact type**, and the DBA label reads "DBA name" (R053).
- Portal access, the temporary password, and roles move from the person form to the portal access pencil on the detail (I0010-R013, R014).
- Destructive actions confirm the same way everywhere: "Archive employee?", "Archive 3 roles?", "Remove email?", "Disconnect storage?", "Remove logo?", with at most one sentence. Restore and Restore selected no longer ask (I0001-R039, M0005-R054, M0003-R022, M0006-02-R016).
- Creating, archiving, and restoring a directory record, label, format, or role shows a notice that closes on its own (M0005-R055, M0003-R023).
- One name per action: Labels' **Rename** is **Edit**; **Add label**, **Add format**, **Add email**, **Add phone**, **Add address**, and **Create role** are **New …**; every directory and Roles search reads "Search by name"; **Logout** is **Log out** (I0001-R041, M0005-R056, M0003-R024).
- Values a user cannot change show as plain text: General and Storage settings without write access, a label's For, and a format's Country (M0005-R057, M0006-01-R012, M0006-02-R017).
- A new address and a new tax ID format start in the tenant's default country (M0005-R058).
- Screens drop text that only explains them: helper text appears only for an invalid value, the record detail loses its kind chip and dividers, Roles loses the Custom chip and Type column, General loses its "Default" captions, and Storage loses its introduction (M0005-R059, R061, M0003-R025, R026, M0006-01-R013, M0006-02-R018).
- An empty directory list says which view or search is empty, and errors name the rule to fix, including the administrator-role message that pointed at the removed Roles section (M0005-R060, R062).
- Tenants, Cells, and Portal Users open a detail dialog from each row's code, database, or email, and their grids show only Code, Name, and Status; Environment, Database, Enabled, and Status; or Email, Status, and Tenants. The cell detail replaces View progress, and the portal user's detail holds the memberships (I0006-R020, I0003-R044, I0002-R017, R018, I0008-R019).
- Portal Users names Deactivate **Archive**, asks before Disable, offers Unlock only while the login is locked, and reports every action as a notice. **Create portal user** and **Register cell** are **New portal user** and **New cell** (I0002-R019–R021, I0003-R045, R046, I0008-R020).
- Roll out reference data is a Cells header action, its panel lists only counts above zero, and its result is a notice (I0007-R021, R022).
- Sessions shows status as plain text, hides Ended while the filter is Active, asks "Revoke N sessions?", and reports revokes as notices (I0009-R015–R017).
- A provisioning conflict names the value that is taken: `CONFLICT` now carries `details.field` (`code`, `client`, or `email`), and the Provision tenant dialog says which. The dialog's helper texts are gone except for an invalid code (I0006-R022, R023).
- `GET /api/admin-tenancy/v1/accounts/users` rows add `tenantCodes` and `locked` (I0002-R017, R021).
- The display mode is a Theme field on Profile; the account menu holds only Profile, Change password, and Log out (I0001-R044).
- Profile saves each setting when it changes, with a notice, and has one **Remove image** control in place of Remove image and Use initials; its "Your settings" heading and explanatory captions are gone (M0006-03-R009–R011).
- Home shows "Your dashboard will appear here." until the dashboard exists, and sign-in shows one notice, "Session ended. Sign in again.", however a session ended (I0001-R045, R046).

### Removed

- The Roles screen's user role assignments section and the `GET /api/access-control/v1/memberships` list it used (M0003-R021). Roles are assigned on the person's detail; the `/memberships/:membershipId/roles` routes stay.

### Fixed

- A request failing `UNAUTHENTICATED` right after the session finished loading now ends the session (I0009-R013). The web app's session status was updated a moment after the screen showed it, so a failure in that gap was ignored; this also made the session-reset test fail intermittently in CI.

## [v0.33.1] - 2026-10-26

### Changed

- A tax ID can belong to only one employee, contact, vendor, or client per tenant, archived records included (M0005-R047). Saving a duplicate fails with `409 DUPLICATE_TAX_ID` naming the record that holds it, and the directory dialog links to that record, or to it in the Archived view where it can be restored (R048). Client contacts are exempt, since one buyer can be a contact on several clients, and records of different kinds may share a number. The `duplicateTaxIds` warning is removed.
- Migration `001-business-directory` is edited in place to add the per-kind unique tax ID index on `app.parties`, so recreate existing cell databases.

## [v0.33.0] - 2026-10-26

### Added

- One login can hold a membership for each of its parties in a tenant, such as an employee who is also a vendor contact (I0012). Sign-in lists one entry per tenant and party, labelled "Employee", "Contact", "Vendor · {name}", or "Client · {name}"; a session acts as exactly one membership, and roles are assigned per membership, so a vendor session never gets the employee's access.

### Changed

- Migrations `001-admin-tenancy`, `001-cell-tenancy`, and `001-access-control` are edited in place for I0012 (membership uniqueness per party, `member_label`, `sessions.membership_id`, role assignments keyed by membership), so recreate existing admin and cell databases.

## [v0.32.0] - 2026-10-25

### Added

- Settings → General lets a tenant set its default country, currency, time zone, date format, language, and records per page (M0006-01). Each setting starts at a default, shows when it is the default, and can be reset to it. Viewing needs `tenant-settings::general::read` and changing needs `tenant-settings::general::write`; without write the screen is read-only. Every change is recorded as a `tenant_settings.updated` administrative event.
- Settings live in one JSON row per tenant, checked by one shared schema in `@nap/shared`, so a new setting needs no migration. Any member of a tenant can read its effective settings from `GET /api/tenant-settings/v1/effective`, and the web app loads them for every page.
- Settings → Storage connects a tenant's own S3-compatible bucket, such as Amazon S3, Cloudflare R2, Backblaze B2, or MinIO (M0006-02). Saving writes, reads back, and deletes a test object first and names why a failed test failed. The secret access key is stored only encrypted, bound to the tenant, and never returned, logged, or recorded. Viewing needs `tenant-settings::storage::read` and changing needs `tenant-settings::storage::write`.
- Settings → General uploads, replaces, and removes the tenant logo once storage is connected, and the header shows it beside the tenant name. Uploads go through the API, which accepts only PNG, JPEG, WebP, or GIF images of at most 2 MB whose content matches their type, and names each object itself. The bucket stays private: files are shown through signed links that expire after 15 minutes. Storage and logo changes are recorded as `tenant_settings.storage_connected`, `storage_changed`, `storage_disconnected`, and `logo_changed` administrative events.
- The API needs a new deploy secret, `FILE_STORAGE_ENCRYPTION_KEY_<ENV>`, base64 for 32 random bytes (`openssl rand -base64 32`), and refuses to start without it.
- Each member has a profile in each tenant (M0006-03). The account menu's new Profile screen shows the tenant's time zone, date format, language, and records per page beside the member's own choice, and "Use tenant setting" returns to the tenant's value. A member can pick one of six bundled animated images, upload their own once storage is connected, or keep their initials; the account button shows the choice. Members read and change only their own profile, through `/api/tenant-settings/v1/profile`, and profile changes record no administrative event.

### Changed

- Phones use the tenant's default country instead of the US (M0005-R046): a number without a leading `+` is read as that country's number, and that country's numbers show in national form while others show in international form.
- Migration `001-cell-tenancy` is edited in place to allow the new `settings_change` outbox topic, and the new `tenant-settings` module adds `app.tenant_settings`, `app.file_storage`, and `app.files`, so recreate existing cell databases.
- `GET /api/tenant-settings/v1/effective` applies the member's own settings and also returns `logoFileId`, `storageConnected`, and `profileImage`.
- Standard grids start at the member's records per page, and choosing another page size saves it to their profile, so it applies in every grid and every browser (M0006-03-R008). The browser-local page-size preference is gone; without a selected tenant, a choice lasts only for the page.
- Migrations `001-cell-tenancy` and `001-tenant-settings` are edited in place again to add `app.member_profiles` and the keys it references, so recreate existing cell databases.

## [v0.31.0] - 2026-10-25

### Added

- Tax ID formats per country (M0005-R036–R042). Settings → Tax ID Formats lists each tenant's formats with Active and Archived tabs; a format is a country, a name, and a mask where `#` is a digit, `A` is a letter, and anything else is a separator. Every tenant starts with US SSN, EIN, and ITIN. Once a record uses a format, only its name and separators can change. Managing formats needs the new `business-directory::tax-id-formats::write` capability.
- Each tax ID names its format, chosen in the record dialog, which defaults to US EIN for vendors and clients and US SSN for people (M0005-R038, R043). Tax IDs show in their format's layout, masked as `•••-••-6789` or revealed as `123-45-6789` (R040). Search matches a tax ID typed in any of the tenant's formats, and duplicates are found across formats (R039).
- Phones are stored in E.164 form (`+12125551234`, with an extension as `;ext=12`) and shown in national form for US numbers and international form otherwise (M0005-R033, R034). A number without a leading `+` is read as a US number, and an invalid number is refused. The API and the web app share one definition of these rules from `@nap/shared`, which now depends on `libphonenumber-js` (R044).

### Changed

- The `business-directory` migration is edited in place to add `app.tax_id_formats` and `app.parties.tax_id_format_id`, so recreate existing cell databases.

## [v0.30.3] - 2026-10-24

### Fixed

- When a save fails because someone else changed the record, the edit form now reloads every record type, not only roles: employees, contacts, vendors, clients, organization contacts, emails, phones, addresses, and labels. The form starts over from the current values, the next Save sends the current revision, and the detail and list behind the form show the change, including after Cancel.

## [v0.30.2] - 2026-10-24

### Changed

- The web client builds with the React Compiler, which adds memoization automatically in dev and production builds. Components it can't compile yet run unchanged.

## [v0.30.1] - 2026-10-24

### Fixed

- The page header (title, search, filters, actions, and the Active and Archived tabs) stays in place on every page; only the content below it scrolls.

## [v0.30.0] - 2026-10-24

### Added

- Active and Archived tabs on every list of records that can be archived (I0011): Employees, Contacts, Vendors, Clients, an organization's contacts, Labels, Roles, and Portal Users. The tabs sit on their own row under the page header, and the view stays in the URL as `?view=archived`, so reload, back, and a copied link keep it; the contacts grid in a record dialog keeps its view in the dialog and opens on Active. Each view lists one set of records and offers only its actions: Active has the create action, Archive, and Archive selected; Archived has Restore and Restore selected. Switching views clears the selection and keeps the search and filters.
- Creating a role with an archived role's code, or adding or renaming a label to an archived label's name, says an archived record holds it and links to the Archived view searched for it. Roles and Labels take their initial search from `?q=`.

### Changed

- The Include archived filter and the Archived tag are gone; the Archived tab replaces them. Archive's confirmation now says archived records move to the Archived tab.
- `GET /accounts/users`, `/roles`, `/labels`, `/people`, `/organizations`, and `/organization-contacts` take `archived` (`true` lists only archived records) in place of `includeArchived`, which now returns `400 INVALID_INPUT`. A `409 CONFLICT` from `POST /roles`, `POST /labels`, or `PATCH /labels/:id` caused by an archived record carries `details: { id, archived: true }`.
- I0001-R030, I0002-R011, R012, R014, and R016, M0003-R017, and M0005-R027–R029 and R031 point to I0011. Roadmap Phase 3 adds deliverable #19, and later deliverables are renumbered.

## [v0.29.4] - 2026-10-23

### Added

- List-screen conventions (I0001-R025–R034). Every list is a standard grid. Single-row actions sit in the row's ⋮ menu, Edit or Rename first and Archive or Restore last. Checkboxes appear only where several rows can be acted on at once. Bulk actions and the create action sit at the right of the page header, with create always last; on a phone the others fold into a ⋮ menu. Search sits in the header, and the filter button opens a panel headed **Filters** with **Clear all**, with each active filter shown as a removable chip. Archived records stay hidden until **Include archived** is on, then show an Archived tag. Success shows a brief notice, and a refused bulk action opens a dialog naming each record and why.
- **Labels** (M0005-R031–R032) is a grid: **Add label** and **Rename** open dialogs, the header has a name search and For and Include archived filters, and selected labels can be archived or restored together through `POST /labels/archive` and `/labels/restore`.
- **Roles** (M0003-R017–R018) is a grid: selecting a role's name opens its detail, the header has a search and Include archived, and selected custom roles can be archived or restored together through `POST /roles/archive` and `/roles/restore`. A batch that includes an immutable role changes nothing.
- **Portal Users** (I0002-R011–R016): deactivated users are hidden until Include archived is on; the header searches by email; the Filters panel narrows by tenant, status, and must change password; and selected users can be deactivated or restored together through `POST /accounts/users/deactivate` and `/accounts/users/restore`. A batch that includes the initial Napsoft login or an administrator changes nothing. `GET /accounts/users` takes `includeArchived`, `email`, `tenantId`, `status`, and `mustChangePassword`.

### Changed

- Directory, Sessions, and the organization contacts list follow the same layout: search and filters moved into the header (or, inside the record dialog, into the contacts toolbar), and Archive selected and Restore selected moved into the header. The Directory name search runs as you type instead of on **Search**.
- **Cells** has no checkboxes. Its actions apply to one cell at a time on purpose, since a cell serves many tenants (I0003-R043).
- **Revoke selected** on Sessions is an outlined button instead of a red filled one, and the single-user **Deactivate** confirmation says the user can be restored instead of "This action cannot be undone."

## [v0.29.3] - 2026-10-23

### Fixed

- The browser tab no longer keeps the last page's title after you leave it; the sign-in screen shows **Sign in · nap.**, so the tab no longer reads "Portal Users · nap." after a sign-out or an expired session.
- The sign-in email and password fields carry `name` attributes, so password managers recognize them.

## [v0.29.2] - 2026-10-11

### Fixed

- **Sessions** in the Tenant Management nav now shows an icon like the other items.
- A known-device token whose signature's last character was changed to an equivalent base64url spelling was accepted as valid; tokens are now compared exactly as issued.

## [v0.29.1] - 2026-10-11

### Changed

- Login throttling (M0001-13). Failures now count on three keys: the email and client address together, which hard-locks after 5 failures, the address alone after 100, and the email alone after 20, each for 15 minutes. One person's mistyped email no longer locks their whole address, and a corrected email from the same address can sign in at once. Failures on the email key delay the next attempt by 2, 4, 8, 16, then 30 seconds; on the address key the delays start at its 10th failure. A successful login clears the email and pair keys.
- A successful, unrestricted login sets a 90-day `nap_device` cookie. A browser holding one for the account it signs in to skips the email-only limit; a password change or reset voids it. `auth.login.throttled` events record which key refused the attempt as `kind`.
- The login screen counts `Retry-After` down and re-enables **Sign in** when it ends, or as soon as the email is edited.
- The API requires `KNOWN_DEVICE_SECRET_<ENV>` (at least 32 characters, distinct from the session, throttle, and tax ID hash secrets) and refuses to start without it. Set `KNOWN_DEVICE_SECRET_PROD` before deploying.

## [v0.29.0] - 2026-10-10

### Added

- Directory grids and bulk actions (M0005-R027–R030). Employees, contacts, vendors, clients, and an organization's contacts are standard grids with server paging. Each row's menu offers **Edit**, and **Archive** (confirming "Archived records are hidden from lists until restored.") or **Restore**; a client buyer's menu also offers **Make primary tax contact**. Selecting rows on the current page offers **Archive selected** when all are active and **Restore selected** when all are archived. `POST /{collection}/archive` and `/restore` take `{ items: [{ id, revision }] }` (up to 100) and apply the single-record rules in one transaction: if any item fails, nothing changes and the response is `409 BULK_FAILED` with `details: [{ id, code }]`, which the screen lists by name. The organization's contact grid has an **Include archived** switch.

### Changed

- `GET /people`, `/organizations`, and `/organization-contacts` return cursor pages, `{ rows, nextCursor }`, with `cursor` and `limit` (1–100, default 50) beside the existing filters, instead of an array of up to 500 records. Each row also names its primary email's and phone's labels.

## [v0.28.0] - 2026-10-10

### Added

- Tenant-managed portal access and roles (I0010). The person create and edit dialog shows **Portal access**, the temporary password, and a **Roles** picker to a user holding both `business-directory::directory::write` and `access-control::assignments::write`; turning access on needs at least one role. Roles chosen before the person first signs in are held and assigned when the membership becomes active, so the login gets exactly the chosen set; a role archived meanwhile is still assigned and grants nothing. Editing the person changes their roles, under M0003's coverage (`GRANT_EXCEEDS_ACTOR`) and last-administrator (`LAST_ADMIN`) rules. Turning access off keeps the roles. Only a user whose home tenant is the tenant may turn access on or change roles, so a Napsoft operator working in a customer tenant gets `403`. People and contacts accept `roleIds`, and their detail includes `roles: [{ id, code, name, held }]` for a session holding `access-control::roles::read`. Holding and releasing a role record `role.held` and `role.released` events.

### Changed

- Migration `001-access-control` is edited in place to add `app.held_roles`, so recreate existing cell databases.

### Fixed

- The record detail dialog failed to load any record with an email, phone, or address, or any organization with contacts, since v0.27.1. The shared response schemas now accept the label names the detail read returns.

## [v0.27.2] - 2026-10-09

### Added

- Session management (I0009). Tenant Management has a **Sessions** screen listing every portal user's sessions, active and ended, filterable by user email, tenant, sign-in date range, and status, with **Revoke** on an active row and **Revoke selected** for the current page. `GET /sessions` (`NAP::admin-tenancy::sessions::read`, new) returns cursor pages with each session's email, tenant, start, last seen, status, and end time. `POST /sessions/revoke` (`sessions::revoke`) revokes up to 100 sessions in one transaction and refuses the whole batch with `403` when any ID is unknown or out of scope.
- When a session ends in one browser tab (logout, revoking it, or a request coming back `UNAUTHENTICATED`), every other tab of that browser goes to sign-in with "Your session ended", keeping its place for after sign-in. Any screen whose request finds the session gone now goes to sign-in instead of showing "Could not load data".

### Changed

- Draft PRDs for the next manual-test follow-ups: I0009 Session Management (a Napsoft Sessions screen with filters and single and bulk revoke, and same-browser tab reset), I0010 Tenant-Managed Portal Access and Roles (portal access and role selection in the person dialog), and M0005-R027–R030 (directory lists as standard grids with row actions and all-or-nothing bulk archive and restore). I0008 points its role-assignment exclusion at I0010.
- Roadmap Phase 3 gains rows 15–17 for these three; later rows are renumbered.

## [v0.27.1] - 2026-10-09

### Fixed

- **Change password** from the profile menu has a **Cancel** button that returns to the previous page. The required first-sign-in change still offers only **Logout**.
- Disabling a cell no longer warns "This action cannot be undone"; the dialog says the cell stops serving until it is activated again. Row actions can now set their own confirmation text.
- The record detail shows each email, phone, and address with its label, and an organization's contact list shows the label of each contact's primary email and phone. Record detail responses include `labelName` on emails, phones, and addresses, and `primaryEmailLabel` and `primaryPhoneLabel` on organization contacts.

## [v0.27.0] - 2026-10-01

### Added

- Portal access (I0008). Turning **Portal access** on for an employee, contact, or (after it has an email) a vendor or client contact sends a request that creates or reuses the person's login and membership; it takes a temporary password, which the person must replace at first sign-in. Turning access off or archiving the person suspends the membership and signs them out of that tenant. Directory lists and records show each person's status (Off, Requested, Invited, On, Failed) with the reason for a failure, and **Retry** resends a failed request (`POST /{collection}/:id/portal-access/retry`).
- Replacing a temporary password activates every pending membership of that login, so the person can select the tenant straight away.
- Napsoft login recovery on Portal Users: **Memberships** (`GET /accounts/users/:id/memberships`), **Reset password** (`POST /accounts/users/:id/password-reset`, which signs the login out everywhere), **Unlock** (`POST /accounts/users/:id/unlock`, which clears the sign-in throttle), and **Disable**/**Enable**. All refuse the initial Napsoft login with `ROOT_IMMUTABLE`.

### Changed

- Turning off portal access for, or archiving, a person who holds `tenant_admin` (or `platform_admin` in Napsoft) fails with `ADMIN_ASSIGNED`, and a user cannot turn off their own access or archive themselves (`INVALID_STATE`).
- A portal user's primary email cannot be added, edited, replaced, or removed while their access is on (`INVALID_STATE`).
- Vendor and client contacts can no longer be created with portal access on; turn it on by editing the contact once it has a primary email.
- Person and contact responses include `portalAccess: { status, failureCode }`.

## [v0.26.1] - 2026-10-01

### Fixed

- The Tenants screen's row menu shows an icon for each action: a handshake for **View client** (as on Directory → Clients) and a refresh arrow for **Retry**, instead of the generic ⋮.

## [v0.26.0] - 2026-10-01

### Added

- New tenants are provisioned from a client record in the Napsoft tenant's Directory: **Provision tenant** on the client takes the code, name, tier, a ready cell, and the first administrator (pickable from the client's contacts). `tenant-provision` now takes `client`, `code`, `name`, and `tier`, creates the tenant and queues its job in one request, and rejects an unknown client (`404`), a client or code already used (`409`), or an unready cell (`503`). `admin.tenants` gains `client_id`, unique among active tenants.
- The Tenants screen offers **View client**, which opens the tenant's Napsoft client record. `GET /tenants?clientId=` returns a client's tenant. A client's contact list shows each contact's primary email and phone and its Primary and Billing contact flags.

### Removed

- `POST /api/admin-tenancy/v1/tenants` and the Tenants screen's **Create tenant** and **Provision** actions.
- Tenant self-designated contacts: the Settings → Tenant Contacts page, the `/tenant-contacts` routes, the `business-directory::tenant-contacts::write` capability, the `directory.tenant_contact.*` events, and the `LAST_PRIMARY_CONTACT` and `NOT_EMPLOYEE` errors. Provisioning no longer flags the first administrator as primary contact.

### Changed

- `is_primary_contact` and `is_billing_contact` now apply only to vendor and client contacts; the database rejects them on a person with no organization.
- The `admin-tenancy` and `business-directory` migrations are edited in place, so recreate existing databases.

## [v0.25.1] - 2026-10-01

### Changed

- Business directory schema: `app.organization_contacts` and `app.tenant_contacts` are gone. Vendor and client contacts are `app.people` rows with an `organization_id`, and use first and last name instead of a full name. A tenant contact is an employee flagged `is_primary_contact` or `is_billing_contact`. An organization contact can carry the same two flags, as its organization's primary or billing contact. Tax IDs move from each record table to `app.parties`, and the database now rejects a tax ID on a vendor contact. The `/organization-contacts` and `/tenant-contacts` routes and `directory.tenant_contact.*` events keep their shape, except contacts take `firstName`/`lastName` in place of `fullName` and add `isPrimaryContact`/`isBillingContact`.
- A duplicate tax ID warning now covers every active record, not just records of the same kind.
- Designating or removing a tenant contact advances that employee's `revision`.
- The `business-directory` migration is edited in place, so recreate existing cell databases.

## [v0.25.0] - 2026-09-30

### Changed

- The web app's **Organization Setup** nav group is now **Directory** (Employees, Contacts, Vendors, Clients). Docs: the module map splits the product area into Directory (`business-directory`) and Settings (`reference-data`, `companies`, `access-control`, `tenant-settings`), and roadmap Phase 3 is now "Directory and Settings".

## [v0.24.1] - 2026-09-30

### Changed

- Web navigation: **Organization Setup** now lists one page per record kind (Employees, Contacts, Vendors, Clients) in place of People and Vendors & Clients, with no kind filter or kind picker. A new **Settings** group holds Roles, Tenant Contacts, and Labels; Roles leaves Tenant Management. Routes move to `/directory/{employees,contacts,vendors,clients}` and `/settings/{roles,tenant-contacts,labels}`; the old paths redirect to the root.

## [v0.24.0] - 2026-09-29

### Added

- Business directory (M0005): employees, contacts, vendors, clients, and their contacts, each with emails, phones, and addresses under tenant-defined labels, plus the tenant's primary and billing contacts. Routes are under `/api/business-directory/v1`, and the web app adds an **Organization Setup** group (People, Vendors & Clients, Tenant Contacts, Labels). A home buyer client takes its primary tax ID from one flagged buyer. The last primary tenant contact cannot be removed.
- Tax IDs are encrypted with AES-256-GCM and stored with a keyed hash for search and the last four digits for display. Reading a full tax ID needs `business-directory::tax-ids::read` and is recorded; setting one needs `business-directory::tax-ids::write`. The API now requires `TAX_ID_ENCRYPTION_KEY_<ENV>` (base64 of 32 bytes) and `TAX_ID_HASH_KEY_<ENV>` (at least 32 characters, different from other secrets) and will not start without them. Neither key rotates, so keep both safe.
- Directory changes reach admin as `directory.*` administrative events through the cell outbox; tax IDs appear only as their last four digits.
- Provisioning a tenant now asks for the first administrator's first and last name and creates them as an employee, with their login email as primary email, as the tenant's first primary contact, and with the default labels. Napsoft setup seeds the default labels; the root login keeps no employee record.

### Changed

- `business-directory` is a foundation module: every tenant can use it, and it is no longer an optional entitlement.
- Member type `client` is now `client_contact`, since a client's portal user is its buyer or contact. An active, ready membership with a member type must have a `member_id`.
- The `app` schema verifier checks every `app` module's tables, not only access control's.
- The admin, cell-tenancy, and new business-directory migrations are edited in place, so recreate existing databases.
- Docs: M0005 is Implemented; roadmap item 13 is Complete; I0003, I0004, I0006, M0001-00-01, M0001-08, M0001-10, and M0002-01 are updated to match.

## [v0.23.0] - 2026-09-29

### Added

- Reference-data rollout (I0007): operators can load a new reference seed version into existing cells from the Cells screen (**Roll out reference data** for all cells, **Load reference data** for one), see per-cell seed state and counts, and retry failures. `npm run db:seed:rollout -- --env <env>` does the same without the API, for when the Napsoft cell itself is missing the seed.
- Admin migration `002-cell-seed-action` allows `seed` provisioning jobs. Run `npm run db:migrate:admin` before starting the API.

### Changed

- A failed `seed` job disables its cell, like other failed provisioning jobs.
- Docs: I0007 is Implemented; roadmap item 12 is Complete; `migrations.md` links the rollout.

### Fixed

- Retrying a failed `activate` job now starts it; before, the worker rejected it with `INVALID_STATE`.

## [v0.22.0] - 2026-09-29

### Added

- Reference data (M0004): each new cell is seeded with ISO 3166-1 countries and ISO 4217 currencies; a cell missing the seed version is not ready (`SEED_MISSING`); `GET /api/reference-data/v1/countries` and `/currencies`; country and currency lookup controls in the web app.

### Changed

- Docs: M0004 is Implemented; roadmap item 11 is Complete.

### Fixed

- After a required password change, the web app now leaves the Change password page for the user's destination instead of showing the empty form again (I0001-R002).

## [v0.21.1] - 2026-09-29

### Fixed

- A tenant administrator can now read their own tenant's module entitlements (`GET /tenants/:tenant/entitlements`); Napsoft grants still reach every tenant, and writes stay Napsoft-only (M0001-10).
- After login, a user with more than one tenant and none selected lands on tenant selection, management access included, instead of Home (I0001-R003).

### Changed

- Map event-reader capabilities to the M0001-12 reader table: `NAP` reads every event, `*` reads every tenant except Napsoft and no null-tenant events, and a tenant code reads only that tenant (R004). No events route exists yet.
- Docs: the Tenants capability is `NAP::admin-tenancy::control::read/write` in I0001, I0002, and M0001-07; M0003 and I0005 are Accepted; M0001, I0001, and I0002 verification evidence is refreshed after the RBAC rewrite; the roadmap marks admin tenancy, application entry, platform administration screens, and cell provisioning complete.

## [v0.21.0] - 2026-09-28

### Added

- Provision customer tenants from the Tenants screen (I0006). An operator picks a ready cell and names the first administrator with a temporary password. The provisioning worker assigns the cell, seeds the immutable `tenant_admin` role and assigns it to that administrator, then activates the tenant so they can select it. Failures show their code, with Retry, and the screen refreshes while jobs run. Adds `tenant-provision` and `tenant-retry` to `POST /control/provision`, a `job` and `anyActive` to `GET /tenants`, and `ready` to `GET /control/overview` rows. The admin migration is edited in place (new `admin.tenant_provisioning` table), so recreate existing databases.
- Add a show/hide toggle to every password field.

### Changed

- A ready customer membership no longer needs a `member_id`; it only has to be active, since the first administrator has no employee record until the Business Directory module exists.

## [v0.20.1] - 2026-09-28

### Fixed

- Protect the bootstrap Napsoft login: account routes can no longer update, disable, or archive it, removing its Napsoft `platform_admin` assignment is refused, and an `admin.protect_root_user` trigger blocks changes other than password resets. Edits the admin migration in place, so recreate existing databases.
- Refuse to disable or archive a portal user, or suspend or archive a membership, while it holds `tenant_admin` or Napsoft `platform_admin` (`ADMIN_ASSIGNED`); the check fails closed when the tenant's cell is unavailable. M0001-08 adds R007–R008 and M0003 is updated to match.

## [v0.20.0] - 2026-09-28

### Added

- Add role-based access control. Each tenant's cell holds its roles, grants, and role assignments. Grants are capability patterns of the form `TENANT::module::router::action`, where any part may be `*`, and a tenant `*` never matches Napsoft.
- Enforce one capability check on every protected API route. A user's patterns come from their home tenant: Napsoft for Napsoft members, otherwise the selected tenant. The target tenant must also be entitled to the module. A denial returns 403 with the required capability and a reason, and a denied write records an `access.denied` event. The API refuses to start if a route declares no capability, one no module lists, or `read` on a route that is not `GET`.
- Add the Roles screen and the `/api/access-control/v1` routes to list, create, edit, archive, and restore roles and to assign or remove them. You can only give out access you hold yourself, and the last active administrator cannot be removed. Every role change records an administrative event.
- Add `GET /api/admin-tenancy/v1/session/capabilities`. The web app uses it to show only the navigation entries and actions the user can use, and shows the reason when the server denies an action.
- Add `npm run db:provision:napsoft`, which provisions the first cell and runs Napsoft tenant setup. Setup seeds the immutable `platform_admin`, `support`, and `tenant_admin` roles and gives the bootstrap login `platform_admin`.

### Removed

- Remove the root user, `admin.platform_roles`, `admin.support_grants`, and support mode, including its session columns and the `/access` support routes. The admin migration is edited in place, so recreate existing databases.

### Changed

- Rewrite M0003 and I0005 for the simplified RBAC model: roles, grants, and role assignments live only in tenant cells; capabilities are `TENANT::module::router::action`, where tenant `*` excludes Napsoft and entitlements always apply; immutable `platform_admin`, `support`, and `tenant_admin` roles are seeded (Napsoft during Napsoft tenant setup); one `requireCapability` check decides every route, with a no-escalation rule for role changes. The M0001 family, I0001–I0004, architecture docs, guides, and READMEs now describe this model: no root user, no `admin.platform_roles`, and no support mode. M0001-02 becomes Napsoft bootstrap, M0001-09 becomes tenant selection, and M0001-05 is superseded by I0005.
- Add a support access design guide in `docs/design-guides/` (staff roles, impersonation, tickets and consent as support rules, and the tenant support log). Design guides are reference only; the README now lists them and spells out acronyms at first use.

## [v0.19.0] - 2026-09-26

### Added

- Add admin-cell sync (I0004). A sync worker inside the API, started in dev and prod, delivers tenant, membership, and module entitlement changes from `admin.outbox` to each tenant's cell, and portal-access requests from each ready cell's `cell.outbox` to the admin database. Each admin write that increments a synced row's `revision` writes its outbox row in the same transaction. Delivery is per tenant under an advisory lock, applies only the highest pending revision per entity, and retries with backoff up to 5 minutes. The worker backfills every assigned tenant's current rows at start, and the Napsoft tenant's rows when it is first assigned a cell.
- Add `requestPortalAccess`, which cell-side code calls inside its own transaction to turn a tenant user's portal access on or off. The admin side creates, reuses, or suspends the login and membership, and the membership change reaches `cell.tenant_members`. Temporary passwords are hashed before they are written; only the hash is stored.
- Add managed event keys `sync.delivery.failed`, `sync.delivery.recovered`, `portal_access.applied`, and `portal_access.failed`.

## [v0.18.3] - 2026-09-26

### Changed

- Every write to a tenant, membership, or module entitlement row that changes a field copied to cells, or archives or restores the row, now increments its `revision`. Membership suspend, activate, archive, restore, and provisioning results previously left `revision` unchanged, so a cell comparing revisions would have ignored them. The rule lives in a shared `RevisionedTableModel` that covers single, `Where`, bulk, and upsert writes; upserts of the same new row wait on an advisory lock so the second sees the first's revision.
- PRD identifiers that are out of order or wrong may be renumbered after asking the developer, instead of never.

## [v0.18.2] - 2026-09-25

### Changed

- Read and write tables through the pg-schemata models instead of raw SQL in the integration tests and three model methods (`cell_provisioning.hasActive` and `requeueRunning`, and the removed `sessions.findById`). Raw SQL remains only where no model applies: role and database setup, catalog checks, and tests that prove the database rejects invalid writes.

## [v0.18.1] - 2026-09-25

### Changed

- Lower the minimum password length from 12 to 8 characters. A temporary password for a new portal user may now be any nonempty password up to 128 characters, since the user must replace it at first login.

## [v0.18.0] - 2026-09-25

### Added

- Add cell provisioning (I0003): a worker inside the API takes a registered cell through setup, migration, seed, and activation with no restart. Locally it creates the cell database on the admin server; in production it creates one Render Postgres instance per cell. Activation saves the cell's connection to `CELL_DATABASES_<ENV>`, and the first provisioned cell becomes the Napsoft tenant's cell, so root can select Napsoft.
- Add the runtime cell registry: the API loads published cells at startup, checks each one (registered, enabled, reachable, physical identity), and serves tenant selection and cell readiness from it. A broken cell reports its reason without stopping startup.
- Add `cell-activate` to `POST /control/provision`, and on the Cells screen a failure code column, auto-refresh while jobs run, a progress dialog, and an Activate action.
- Select the tenant automatically after login when exactly one is eligible.

### Changed

- Replace the separate platform (`/management`) and tenant (`/app/:tenantId`) shells with one application shell at `/home`. Tenant Management stays in the navigation whether or not a tenant is selected, the tenant control can switch tenants, and it shows `Select tenant` when none is selected.
- Startup now requires the `nap-admin` password (`NAP_ADMIN_PSWD_DEV`, or `adminPassword` in `ADMIN_DATABASE_PROD`) and, in production, the Render API settings, because the provisioning worker needs them.

- Merge the feature and workflow PRD categories into one, inter-module workflow (I), for PRDs that own no tables and use several modules' data, whether a user or a background worker starts them. Move them to `docs/PRDs/inter-module-workflows/` and rename F0001 to I0001, F0002 to I0002, and W0001 to I0003, including requirement IDs in docs, code comments, and tests. Plain "workflow" and "feature" keep their English meaning.

## [v0.17.0] - 2026-09-24

### Changed

- Remove row-level security from the `cell` tables, edited in place in baseline migration `001-cell-tenancy`, which no persistent cell has run. Only system code reads and writes these tables, as with `admin` tables; `verifyCell` now requires RLS off. Tenant business tables in the `app` and `reporting` schemas still require RLS (M0002-01-R006).
- Narrow M0002 Cell Tenancy to M0002-01 and M0002-02 and mark it complete. Move the runtime cell registry to workflow PRD W0001 (Draft), and list tenant context, tenant, membership, and entitlement sync, cell-to-admin delivery, cell health, and cell readiness as future workflows and features.
- Sync documentation with the code: PRD statuses, signatures, events, and routes in M0001; runtime-registry references pointing at W0001; the roadmap; and the READMEs and setup guides, which now cover `db:bootstrap`, the `ROOT_*` settings, and the shipped routes and screens.

## [v0.16.0] - 2026-09-24

### Added

- Add the cell database foundation (M0002-01): the `cell-tenancy` module with five `cell` tables in baseline migration `001-cell-tenancy`, a cell module registry kept apart from the admin registry, and `migrateCell`, which migrates one cell database and checks its tables, grants, and row-level security. Nothing calls `migrateCell` yet; cell provisioning will.
- Add the physical identity check (M0002-02): `verifyPhysicalIdentity`, which compares a cell's `cell.physical_identity` row against its `admin.cells` record and `current_database()` before the cell is trusted to serve tenant traffic. Nothing calls it yet; the runtime cell registry will.

### Changed

- Add the M0002 Cell Tenancy overview with its ten Work Units and status table, and number new modules' Work Units from `-01` (M0001 keeps `-00`).
- Narrow M0001-05 to root authority and mark it Complete, moving role seeds, assignments, non-root resolution, and wildcard capability matching to a draft M0569 PRD. Renumber the root-authority requirement to M0001-05-R001, mark Admin Tenancy complete in the roadmap, point deferred-role references in PRDs and code comments at M0569, and record that the roadmap is a checklist and each PRD must be one atomic unit.
- Remove PRDs whose implementation has not started from the repository, and rewrite implemented PRDs and code comments so they no longer reference them. Clear PRD names from roadmap rows that have not started, and mark Access Control Not started instead of Blocked. Correct the `portal_users.status` documentation: failed-login throttling does not change `status`, and `locked` is reserved for a future operator-cleared lock.

## [v0.15.3] - 2026-09-23

### Added

- Add the `admin.outbox` table, edited in place in baseline migration `001-admin-tenancy`, where tenant, membership, and entitlement changes wait for delivery to their cell. Before migrating, run `apps/api/src/scripts/sql/001-admin-tenancy-outbox.sql` as `nap-admin` against each existing admin database, after `001-admin-tenancy-support-grants.sql`. Recreate disposable databases instead.

### Changed

- Add Portal Access to the roadmap after Business Directory; later roadmap orders shift by one.

## [v0.15.2] - 2026-09-23

### Added

- Add the `admin.support_grants` table and a `break_glass` session access mode, edited in place in baseline migration `001-admin-tenancy`, recording support requests to act as a tenant member and the member's or `tenant_admin`'s decision. Before migrating, run `apps/api/src/scripts/sql/001-admin-tenancy-support-grants.sql` as `nap-admin` against each existing admin database, after `001-admin-tenancy-vendor-contact.sql`. Recreate disposable databases instead.

## [v0.15.1] - 2026-09-22

### Changed

- Rename the membership and provisioning-job member type `vendor` to `vendor_contact`, edited in place in baseline migration `001-admin-tenancy`. Before migrating, run `apps/api/src/scripts/sql/001-admin-tenancy-vendor-contact.sql` as `nap-admin` against each existing admin database: it rewrites both check constraints and existing rows and updates the migration ledger hash. Recreate disposable databases instead.

## [v0.15.0] - 2026-09-22

### Added

- Add platform administration screens under Tenant Management: Tenants (create-only), Cells (register, retry failed provisioning, disable), and Portal Users (create, deactivate, restore — with the root account shown read-only). Backed by two new cursor-paginated endpoints, `GET /api/admin-tenancy/v1/tenants` and `GET /api/admin-tenancy/v1/accounts/users`.

### Fixed

- Fix `ContextualActionHeader` layout props being dropped, and `PageHeaderContext` re-rendering consumers on every title change.

## [v0.14.0] - 2026-09-22

### Added

- Add the browser application shell: login with throttling and required password change, session restoration, protected routes, tenant selection and switching, platform and tenant Home areas, responsive navigation with contextual actions, and a light/dark display-mode toggle. A new `GET /api/admin-tenancy/v1/access/context` endpoint gives the browser one authoritative startup read of the session, selected tenant, and the per-destination `entryPoints` — including the Tenant Management navigation gate — used to route a signed-in user.

## [v0.13.0] - 2026-09-21

### Changed

- Reconcile the M0001-06, M0001-08, and M0001-09 Work Unit PRDs and the Admin Tenancy family roadmap: mark all three `Implemented`/`Complete` with fresh verification evidence, matching code and tests already merged.
- Add `npm run test:db:local`, which provisions a disposable local PostgreSQL 18 cluster, runs `test:db`'s integration tests against it, and tears the cluster down afterward — you no longer need to manually stand up a fixture server to run them locally.

## [v0.12.0] - 2026-09-21

### Added

- Add tenant selection and support access under `/api/admin-tenancy/v1/access`: list a portal user's own eligible tenants, select one for normal work, and enter or exit a time-limited, attributed support context on another tenant. Selection and entry each rotate the session token; a support session's 60-minute access window is enforced automatically, downgrading and rotating the token on the next request once it passes. Support entry is denied without exposing tenant data when the target is the Napsoft tenant.
- Add module entitlement read, grant, and withdrawal under `/api/admin-tenancy/v1/tenants/:tenant/entitlements`: read the full optional-module catalogue with each module's effective state and revision, and grant or withdraw one module idempotently — repeating the current state returns it unchanged, and withdrawing an already-disabled or never-granted module never creates a row. Concurrent changes to the same tenant and module serialize to one committed result, and each change records an administrative event and advances the tenant's entitlement cache revision.

## [v0.11.0] - 2026-09-21

### Added

- Add ordinary portal-user and tenant-membership administration under `/api/admin-tenancy/v1/accounts`: create-or-reuse, read, update, archive, and restore a portal user; create a membership with its queued provisioning job, suspend, reactivate, archive, and restore a membership; read and retry a provisioning job. Disabling or archiving a user revokes every session it holds, and suspending or archiving a membership revokes only sessions that selected its tenant. A required `Idempotency-Key` on both create routes makes a repeated or concurrent request return the original result instead of creating a duplicate.

## [v0.10.0] - 2026-09-21

### Added

- Add cell registration, retry, and disable, plus an operator overview and per-cell readiness read, under `/api/admin-tenancy/v1/control`. Registration only records intent — it never creates a physical database inside the request — and support cannot retry or disable a cell holding the Napsoft tenant.
- Add central tenant creation under `POST /api/admin-tenancy/v1/tenants`. Creation reports the new tenant as pending, unassigned, and unprovisioned; a required `Idempotency-Key` makes a repeated or concurrent request return the original tenant instead of creating a duplicate, and only `db:bootstrap` can ever designate the owning Napsoft tenant.

## [v0.9.0] - 2026-09-20

### Added

- Allow an unrestricted root session to revoke another user's session using the built-in root capability set.

## [v0.8.0] - 2026-09-20

### Added

- Add the `db:bootstrap` maintenance command to create or verify the owning Napsoft tenant, root portal user, and root membership, idempotently and safely under concurrent execution. The root account starts active with no forced password change, since root authority comes directly from `is_root` rather than a role assignment.

### Changed

- Define root authority as the built-in `platform_admin` capability set derived from `is_root`, without a role assignment or cell-role seed dependency.

## [v0.7.0] - 2026-09-20

### Added

- Add Admin login with password verification, per-account and per-client-address throttling after five failed attempts in fifteen minutes, and required temporary-password replacement that revokes every other session.

### Changed

- Require `AUTH_THROTTLE_SECRET_<ENV>` at API startup, alongside `ARGON2_MEMORY_KIB`, `ARGON2_TIME_COST`, and `ARGON2_PARALLELISM` floors for password hashing.

## [v0.6.0] - 2026-09-20

### Added

- Add Admin browser sessions with opaque tokens, idle and absolute expiry, rotation, revocation, and the BFF request chain that serves them.

### Changed

- Require `SESSION_SECRET_<ENV>` and `APP_ORIGIN_<ENV>` at API startup, and reject `SameSite=None` or insecure production session cookies.

## [v0.5.0] - 2026-09-20

### Added

- Add an append-only Admin event history with a validated catalogue, transactional append, and authorized, filtered, paginated reads.

## [v0.4.0] - 2026-09-19

### Added

- Add PostgreSQL revision vectors and optional Redis validation for consistent Admin authorization caches.

## [v0.3.0] - 2026-09-19

### Added

- Add scoped Admin tenant, portal-user, credential, and membership reads with safe field selection and stable pagination.

## [v0.2.0] - 2026-09-19

### Added

- Set up and migrate the Admin database locally and on Render, with schema verification and retry recovery.
- Serve the built web client through the BFF and check Admin database readiness before accepting requests.

### Changed

- Define the Admin Tenancy PRD work units, database schema contracts, and tenant role seeding; refine PRD authoring guidance.
- Document workspace responsibilities, database setup, and runtime configuration; add PostgreSQL integration tests to CI.

## [v0.1.0] - 2026-09-17

### Fixed

- Allow the first automated release without a pre-existing version tag and
  prevent unlabeled merges from publishing pending releases.

### Changed

- Document the BFF, admin/cell architecture, migration strategy, and module boundaries.
- Add PRD authoring guidance and a reusable requirements template.
- Add the NAP brand reference, visual specimens, and favicon assets.
- Add the development roadmap and CI validation for declared progress updates
  and completion evidence; unrelated PRs require no roadmap update.
