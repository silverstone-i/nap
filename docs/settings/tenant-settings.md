# Tenant settings

## Settings register

**Design:** Accepted with [PRD 0009](../PRDs/0009-product-shell-and-navigation.md).
This register owns tenant-setting names, values, defaults, and availability.
Settings apply to one tenant. No concrete tenant settings have been selected
for initial implementation; add entries only when an owning requirement needs
one. Tenant-logo placement does not itself define a logo-storage setting.

Future entries record name, purpose, scope, allowed values, default, and
implementation status, matching the [user register](user-settings.md).

## Resolution and persistence

Use the same default-resolution approach as user settings: a consuming setting
lookup returns its documented default when no valid override exists. Do not
query a nonexistent table or endpoint or parse Markdown at runtime. A lookup
need not be introduced until there is a concrete tenant setting to consume.

Persistence and management screens are deferred. JSONB was discussed as a
possible future storage format, not an accepted physical schema. Storage,
validation, authorization, audit, and migration behavior belong to a later
accepted design. Roles, permissions, and entitlements remain in their owning
contracts rather than becoming settings. No user setting implicitly overrides
a tenant setting, and no tenant default implicitly overrides a user setting.

Updated 2026-09-09 — Initial review register; no runtime changes.

Updated 2026-09-10 — Accepted with PRD 0009; no concrete tenant setting or persistence was introduced.
