# Environment configuration restructuring

Design accepted 2026-09-12. Implemented locally; PR preparation authorized. Not merged or shipped.

## Features

- DEV, PROD, Common sections; TEST under DEV.
- Shared local and independent production role passwords.
- UUID-keyed endpoint configuration and code-built connections.
- Environment-specific authentication, bootstrap, Redis, cookies, and proxy settings.
- Existing script inputs adapted for explicit cell UUID selection.

## Scope

Update configuration readers, .env.example, the private local .env, consumers,
fixtures, CI inputs, and owning documentation. Preserve existing secrets except
the owner selected ADMIN_DATABASE_URL_DEV's runtime password for all DEV targets.
No database operations, migrations, new CLI scripts, Render changes, or deployment.
Registry and physical identity validation are deferred to the setup workflow.

## Verification

Run configuration/unit and static checks. Database-mutating integration and setup
suites remain deferred by owner instruction. Record actual results on completion.

## Local verification — 2026-09-12

- API unit tests: 145 passed across 22 files, including environment selection,
  credential encoding, duplicate UUIDs, selected maintenance inputs, auth and cache.
- Non-database toolchain tests: 23 passed across 6 files; compiled migration/reset
  refusal cases exit before environment loading or database access.
- Lint, typecheck, build, formatting, licenses (227 records), and diff checks pass.
- Local .env parsing and runtime/auth/cache configuration validated privately.
  The DEV runtime password came from ADMIN_DATABASE_URL_DEV as instructed;
  configured UUIDs were retained. No PostgreSQL password was changed.
- Initial broad unit execution hit sandbox socket restrictions and incorrect cwd;
  rerunning from apps/api with local-listener permission passed. Typecheck caught
  argument-result typing and a duplicate fixture property; both were corrected.
- Database integration, server-with-database and setup suites were not run.
  No migration, database operation, Render change, or deployment was performed.

## Remaining work

The existing setup command still prepares admin plus its explicitly selected
cell. Registration and physical identity validation, independent admin/cell
provisioning procedures, and production infrastructure automation remain deferred.
This change does not certify that configured cells are provisioned or reachable.

## PR validation — 2026-09-12

The owner's `/ship pr with release:minor` request authorized the full shipping
checks after the configuration-only task. All 444 tests passed (32 toolchain,
318 API, 80 web, 14 shared), including disposable database integration and setup
fixtures. Lint, typecheck, build, formatting, licenses (227 records), and diff
checks passed. No configured application database or Render resource was changed.
The earlier deferred-test note records the initial configuration task only.
