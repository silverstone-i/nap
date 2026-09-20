# M0003: Access Control

## Scope

Access Control owns tenant-local role definitions, capability sets, and later
business-resource access scopes in each cell's `app` schema.

M0003-00 is delivered early because M0001-05 must seed and resolve roles before
Admin Tenancy can store valid portal-user assignments. Custom-role administration
and business-resource scopes remain in Phase 2.

## Access Control Work Units

| Start order | Work Unit / PRD                                                                                   | Required work                                                    | Tables      | Status   | Blocker / evidence                                                                                      |
| ----------: | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------- | -------- | ------------------------------------------------------------------------------------------------------- |
|           1 | [M0003-00: Role catalogue foundation](M0003-access-control/M0003-00-role-catalogue-foundation.md) | Store, seed, protect, and resolve tenant-local role definitions. | `app.roles` | Complete | [Verified 2026-09-20](M0003-access-control/M0003-00-role-catalogue-foundation.md#verification-evidence) |

## Status Tracking

- `Not started`: implementation has not begun.
- `In progress`: implementation or verification is underway.
- `Blocked`: a recorded decision or dependency prevents progress.
- `Complete`: the accepted PRD's requirements pass verification.

The broader M0003 deliverable remains incomplete until its Phase 2 Work Units
define custom roles, assignments, and access scopes.
