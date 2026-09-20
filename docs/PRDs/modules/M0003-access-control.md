# M0003: Access Control

## Scope

Access Control owns tenant-local role definitions, capability sets, and later
business-resource access scopes in each cell's `app` schema.

M0003-00 begins after a supported cell provisioning and migration path exists.
M0001-05 can grant root authority without this module, while role seeds,
assignments, and non-root resolution wait for the tenant-local catalogue.

## Access Control Work Units

| Start order | Work Unit / PRD                                                                                   | Required work                                                    | Tables      | Status  | Blocker / evidence                                  |
| ----------: | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------- | ------- | --------------------------------------------------- |
|           1 | [M0003-00: Role catalogue foundation](M0003-access-control/M0003-00-role-catalogue-foundation.md) | Store, seed, protect, and resolve tenant-local role definitions. | `app.roles` | Blocked | Requires supported cell provisioning and migration. |

## Status Tracking

- `Not started`: implementation has not begun.
- `In progress`: implementation or verification is underway.
- `Blocked`: a recorded decision or dependency prevents progress.
- `Complete`: the accepted PRD's requirements pass verification.

The broader M0003 deliverable remains incomplete until its Phase 2 Work Units
define custom roles, assignments, and access scopes.
