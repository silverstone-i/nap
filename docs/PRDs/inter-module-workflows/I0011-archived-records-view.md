# I0011: Archived Records View

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Implemented                                                                                                                                                                                                                                                                                                                                                |
| Type                 | Inter-module workflow                                                                                                                                                                                                                                                                                                                                      |
| Related architecture | [BFF](../../architecture/bff.md)                                                                                                                                                                                                                                                                                                                           |
| Related PRDs         | [I0001: Application Entry and Shell](I0001-application-entry-and-shell.md), [I0002: Platform Administration Screens](I0002-platform-administration-screens.md), [M0003: Access Control](../modules/M0003-access-control.md), [M0005: Business Directory](../modules/M0005-business-directory.md), [I0009: Session Management](I0009-session-management.md) |
| Related decisions    | An archived record is a soft-deleted record. A list shows active records or archived records, never both (2026-10-23).                                                                                                                                                                                                                                     |
| Last reviewed        | 2026-10-23                                                                                                                                                                                                                                                                                                                                                 |

## 2. Purpose

Today a list mixes archived records into the active list once the user turns on
the Include archived filter (I0001-R030). An archived record is a deleted
record, so the mix lets a user act on deleted and live records in one
selection, and every bulk action needs an "all selected rows are in the same
state" rule. This workflow gives each list two views, Active and Archived,
that the user switches between with tabs. Each view shows one set of records
and offers only the actions that apply to it.

## 3. Scope

### Included

- Active and Archived tabs on every list of records that can be archived:
  Employees, Contacts, Vendors, Clients, an organization's contacts, Labels,
  Roles, and Portal Users.
- The view in the page URL, and the default view.
- The actions each view offers.
- The `archived` query parameter that replaces `includeArchived` on those
  lists' endpoints.
- Telling the user when a create or rename is refused because an archived
  record holds the value.

### Excluded

- Sessions (I0009). An ended session is a status, not a record a user
  archives and restores. Its Status filter stays.
- Tenants and Cells (I0002). Neither can be archived.
- Archive and restore rules, events, and bulk endpoints, which stay with each
  record's PRD (I0002-R013, M0003-R018, M0005-R030, M0005-R032).
- Record detail views. Opening an archived record's detail is unchanged.
- Linking a portal-user email conflict or a tax ID already held by an archived
  record (M0005-R013) to that record. Either may follow later.

## 4. Actors And Permissions

No new permission. Each screen keeps its read and write capabilities, and
actions the session cannot perform stay hidden (I0001-R033).

| View     | Create action | Row action                   | Multi-row action |
| -------- | ------------- | ---------------------------- | ---------------- |
| Active   | Shown         | Edit or Rename, then Archive | Archive selected |
| Archived | Hidden        | Restore                      | Restore selected |

Edit or Rename appears only where the screen's PRD offers it. Portal Users
names its archive actions Deactivate and Deactivate selected (I0002-R014).

## 5. Concepts And Terminology

| Term     | Meaning                                                                                   |
| -------- | ----------------------------------------------------------------------------------------- |
| Archived | Soft-deleted: hidden from normal use and restorable. Portal Users calls this deactivated. |
| View     | Which set a list shows: Active (not archived) or Archived.                                |

## 6. Functional Requirements

### View tabs

- I0011-R001: Each screen listed in §3 Included must show Active and Archived
  tabs. No other list screen shows them.
- I0011-R002: On a page, the tabs must sit at the leading edge on their own
  row directly below the contextual action header's row of title, search, and
  actions (I0001-R028, R029), and above the active-filter chips. In a grid
  inside a dialog (I0001-R034), they must sit at the leading edge of the
  dialog's toolbar.
- I0011-R003: On a page, the URL must carry the view as `?view=archived`. A
  missing or other value means Active, so every visit without it opens on
  Active. Reload, back, forward, and a copied link keep the view. A grid
  inside a dialog keeps its view in the dialog only and opens on Active.
- I0011-R004: Each view must list only its records. The Include archived
  filter and the Archived tag next to a record's name are removed.
- I0011-R005: Each view must offer only its actions, as in the §4 table.
- I0011-R006: Switching views must clear the selection and return to the
  first page. Search and other filters keep their values.
- I0011-R007: The Archive confirmation must read "Archived records move to the
  Archived tab." in place of "Archived records are hidden from lists until
  restored." (M0005-R028).

### Values held by archived records

- I0011-R008: When a create or rename is refused because an archived record
  already holds the role code (M0003, unique including archived roles) or the
  label name (M0005-R017, unique within its group including archived labels),
  the error must say an archived record holds the value and link to the
  Archived view searched for it (`?view=archived&q=<value>`). The Roles and
  Labels screens must take their initial search from `q`.

## 7. Business Rules And Invariants

- A list request returns active records or archived records, never both.
- The view is display state. It grants nothing; the server still authorizes
  every request and action.
- Uniqueness rules are unchanged. An archived record keeps its code or name.

## 8. Lifecycle And State Transitions

No new states. Archiving moves a record from the Active view to the Archived
view; restoring moves it back. The record leaves the current view on success.

## 9. Data Requirements

Not applicable. No schema change; each list filters on its existing archived
column.

## 10. API Requirements

- I0011-R009: These endpoints must accept `archived` (`true` or `false`,
  default `false`) in place of `includeArchived`. `false` returns only active
  records and `true` returns only archived records. Any other value is
  `400 INVALID_INPUT`. `includeArchived` is no longer accepted.

| Endpoint                                   | Owning PRD |
| ------------------------------------------ | ---------- |
| `GET /api/admin-tenancy/v1/accounts/users` | I0002-R011 |
| `GET /roles`                               | M0003 §10  |
| `GET /labels`                              | M0005-R031 |
| `GET /people`                              | M0005-R027 |
| `GET /organizations`                       | M0005-R027 |
| `GET /organization-contacts`               | M0005-R027 |

- I0011-R010: A `409 CONFLICT` from `POST /roles`, `POST /labels`, or
  `PATCH /labels/:id`, caused by an archived record holding the value, must carry
  `details: { id, archived: true }` so the screen can link to it (R008). A
  conflict with an active record keeps its current response.

## 11. Cross-Module Interactions

Not applicable. Each list reads only its own module's records; this workflow
changes how the shell and each screen present them.

## 12. Security And Audit

- `details.id` in R010 is returned only to a caller who already holds the
  screen's read capability, which lets them list that record anyway.
- No new events. Archive and restore events are unchanged.

## 13. Acceptance Criteria

| Criterion | Outcome                                                                                                                                        | Requirements     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| AC01      | Each screen in §3 Included shows Active and Archived tabs below the page title, or in the dialog toolbar; Sessions, Tenants, and Cells do not. | I0011-R001, R002 |
| AC02      | A page opens on Active; `?view=archived` opens Archived and survives reload, back, and a copied link; a dialog grid opens on Active.           | I0011-R003       |
| AC03      | Active lists only active records and Archived only archived ones; there is no Include archived filter and no Archived tag.                     | I0011-R004, R009 |
| AC04      | Archived hides the create action and offers Restore and Restore selected; Active offers Archive and Archive selected.                          | I0011-R005       |
| AC05      | Switching views clears the selection and returns to page one while search and filters keep their values.                                       | I0011-R006       |
| AC06      | The Archive confirmation reads "Archived records move to the Archived tab."                                                                    | I0011-R007       |
| AC07      | A list endpoint with `archived=true` returns only archived records, with no value only active ones, and with any other value `400`.            | I0011-R009       |
| AC08      | Creating a role with an archived role's code, or a label with an archived label's name, shows an error that links to it in the Archived view.  | I0011-R008, R010 |

## 14. Outstanding Questions

None.

## Verification Evidence

Verified on 2026-10-23 in [silverstone-i/nap#64](https://github.com/silverstone-i/nap/pull/64); its CI checks (changelog, checks, roadmap) pass.

- `npm run lint` and `npm run format:check` pass. `npm test` passes: API unit 582, web 242, shared 1, toolchain 25. `npm run test:db:local` passes 294, including the new cases for `archived=true` and the refused `includeArchived` on `/accounts/users`, `/roles`, `/people`, and `/labels`, and the archived-holder `details` on role create and label create and rename (AC03, AC07, AC08).
- Web tests cover the tabs and `?view=archived` (AC01, AC02), create hidden and Restore selected only in Archived (AC04), search and filters kept across a switch (AC05), the dialog's contacts tabs staying out of the page URL (AC02), the new Archive text (AC06), and both conflict links (AC08).
- On the dev stack: a custom role archived through the API left the active list and appeared alone in `GET /roles?archived=true`; `?includeArchived=true` returned `400 INVALID_INPUT`. Creating a role with its code in the Create role dialog showed "An archived role already uses this code." with a link to `/settings/roles?view=archived&q=<code>`; following it closed the dialog, opened the Archived tab, and searched for the role, with no Create role action. Restore selected restored it to the active list. Employees opened on `?view=archived` kept the Archived tab after a reload, with no New employee action and no Include archived switch.
