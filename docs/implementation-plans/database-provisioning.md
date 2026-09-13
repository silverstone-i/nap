# Register cell provisioning

Design: Accepted 2026-09-13. Implementation: Implemented locally and validated; uncommitted, not shipped.

## Delivery checklist

- [x] Forward migration to UUID/database name and durable operation progress.
- [x] Shared DEV/TEST local and PROD Render service; server-only credentials.
- [x] One API runner; retry/startup recovery; no cell CLI or cookie forwarding.
- [x] Live pool/router addition, readiness and shutdown.
- [x] Register form, copy UUID, progress, Retry/Activate/Disable and tenant labels.
- [x] Preserve existing operations, credentials, identities and dotenv alignment.
- [x] Disposable single/multiple-cell tests, PROD mocks, permissions and browser flow.

## Validation

Recorded 2026-09-13:

- `npm test`: 471 passing tests (57 toolchain, 326 API, 74 web, 14 shared).
- Lint, typecheck, build, production license checks, formatting and
  `git diff --check` passed.
- Disposable PostgreSQL uses non-superuser `nap_admin` with CREATEDB/CREATEROLE.
  Shared-service tests cover numeric names, validation, duplicates, failures at
  every stage, retry, interrupted startup, legacy private state and identity
  mismatch, safe migration refusal and preservation of existing UUIDs.
- One running API loads east, west and numeric TEST cells, provisions tenants,
  serves their authenticated HTTP requests through dynamically installed routers,
  and verifies cross-database isolation. One unavailable pool leaves healthy
  tenant requests and management working. Shutdown closes every added pool;
  restarting the API reloads saved cells and serves the existing tenant sessions.
- Render mocks cover uncertain creation, delayed readiness, internal connections,
  persistence failures and save-only configuration recovery without deployments.
  No paid resources were created.
- TEST management rejection, registry/overview permissions, server-owned environment,
  progress/actions and UUID copying are covered by API/UI tests.
- `.env` and `.env.example` have matching line count, keys, comments and ordering;
  values differ. Publication tests preserve prior entries and allow the running
  API to publish new cells despite retaining its original process environment.

Browser evidence: native Chrome, disposable DEV API and Vite at
`127.0.0.1:5199`, 2026-09-13. Signed in as the fixture root, entered `east`,
verified `nap_dev_cell_east` preview, registered and observed automatic Enabled
status for UUID `60ceb34b-190e-4f86-91cf-96fe612b19e4`. Clicking the UUID showed
Copied. Disable displayed tenant-access confirmation and produced Disabled;
Activate returned through Queued to Enabled without restarting. Accessibility
states and screenshots were captured in the implementation session. The fixture
owned its database and configuration; the developer's databases were untouched.

The forward admin migration has not been applied to the developer's database.
The provisioning guide documents the upgrade command and metadata prerequisites.
Live Render provisioning remains unexercised; automated validation uses mocks.
