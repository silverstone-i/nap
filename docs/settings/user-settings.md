# User settings

## Settings register

**Design:** Accepted with [PRD 0009](../PRDs/0009-product-shell-and-navigation.md).
This register owns setting names, values, defaults, and availability. Future
persisted settings belong to one user within one tenant, including independent
preferences for each tenant a vendor accesses.

| Setting       | Purpose                                             | Scope                                                                         | Allowed values                                                        | Default   | Implementation status                                                             |
| ------------- | --------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------- |
| Mode          | Select appearance                                   | User within tenant; existing device-local behavior retained during transition | System, Light, Dark                                                   | System    | Existing selector/local storage implemented; tenant-specific persistence deferred |
| Rows per page | Default list page size                              | User within tenant                                                            | 25, 50, 100                                                           | 25        | Default lookup implemented; storage and preference editor deferred                |
| Landing page  | Choose application entry after tenant establishment | User within tenant                                                            | Implemented, accessible destinations when configuration is introduced | Dashboard | Configurability deferred; initial shell uses static Dashboard                     |

Page sizes are product choices, not a claim about an installed MUI license limit.

## Resolution and persistence

Future consuming code resolves a documented setting and uses its default if no
valid override exists. Until persistence exists, there is no database lookup,
endpoint request, or runtime parsing of this Markdown file. Keep the lookup
small; do not build a general settings framework in the shell.

Mode preserves the existing validated `nap:theme-mode` device-local preference,
including System behavior, storage-failure handling, and OS-change response
owned by the specification. This is the explicit transitional exception to
future user-within-tenant storage, not a second persistence implementation.

The lookup boundary can later accept stored overrides. Storage shape, migration,
editing permissions, and transition from device-local Mode require an accepted
settings design. Do not silently copy one tenant's overrides into another.
There is no implicit tenant-to-user inheritance in this draft.

Updated 2026-09-09 — Initial review register; no runtime changes.

Updated 2026-09-10 — Accepted with PRD 0009; shell lists use the documented default lookup.
