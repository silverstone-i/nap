# Render Admin database setup

## Prepare the fork and service

Complete dependency installation from [Development setup](development-setup.md).
In your fork, review `render.yaml`: choose the service name, deployment branch,
region, web-service plan, and PostgreSQL plan/storage defaults before creating
paid resources. Keep the API service and database in the same workspace and
region. The Blueprint creates only the web service; the setup command creates
the Admin database. Commit your configuration to the chosen branch.

In Render, create a Blueprint from your fork and `render.yaml`. Record its
workspace ID and the web service's `srv-...` ID, not the Blueprint ID. Create a
Render API key under your account settings. See
[Render Blueprint setup](https://render.com/docs/infrastructure-as-code) and
[Render API](https://render.com/docs/api).

The service runs the BFF and serves the built React app and API from the same
origin. Startup requires the Admin schema and safe `nap-app` credentials;
`/health/ready` checks that connection and required table access. Runtime cell
routing remains later work ([W0001](../PRDs/workflows/W0001-runtime-cell-registry.md)).

The first deployment cannot become ready before Admin setup and migration.
Record the service ID, complete the commands below, then manually deploy again.
The CLI runs locally and does not require a healthy API process.

## Configure local maintenance

Copy `apps/api/.env.example` to `apps/api/.env` if absent and set file permissions
to `0600`. Set `RENDER_API_KEY`, `RENDER_WORKSPACE_ID`, and
`RENDER_API_SERVICE_ID`. Set `ADMIN_DATABASE_NAME_PROD` before the first run
(default `nap_prod_admin`) and preserve it on retries. No endpoint is required
before the provider creates the database.

`RENDER_REGION`, `RENDER_POSTGRES_VERSION`, `RENDER_POSTGRES_PLAN`, and
`RENDER_DISK_GB` come from nonblank inherited environment values, then nonblank
private file values, then the Blueprint. PostgreSQL 18 is required. The setup
command uses your choices to create a billable resource.

The CLI generates and retains independent application-role passwords in
`apps/api/.env.provisioning.prod.json`, written with `0600` permissions. Use
`NAP_PROVISION_STATE` to override that path. Back this file up privately: its
resource ID, operation identity, and credentials are required for safe retries.
Do not discard it after a timeout or interrupted command.

## Set up and migrate Admin

```sh
npm run db:setup:admin -- --env prod
npm run db:migrate:admin -- --env prod
npm run db:bootstrap -- --env prod
```

Bootstrap reads `ROOT_TENANT_CODE_PROD`, `ROOT_COMPANY_PROD`,
`ROOT_EMAIL_PROD`, and `ROOT_PASSWORD_PROD`.

Setup validates the service identity, saves creation intent, creates or reconciles
one database, and waits for availability. It discovers the operator's direct
IPv4 address using OpenDNS, saves a temporary access rule, and uses provider
credentials to create missing `nap-admin` and `nap-app` roles. It preserves
compatible existing roles, transfers a newly provisioned database's ownership
to `nap-admin`, verifies grants, and publishes `ADMIN_DATABASE_PROD` with the
internal endpoint to the service. Migration runs as `nap-admin` and verifies
schema, triggers, grants, and migration checksums before reporting success.

Both operations remove only their own temporary access rule on completion or
failure. A pre-existing operator rule is preserved. Failed cleanup retains its
intent in the private state file for the next run. Publication updates saved
service configuration; use Render's Manual Deploy or Restart when a running
application needs to consume changed settings.

After setup and migration, use Manual Deploy to start the BFF with the published
configuration. `TRUST_PROXY_HOPS_PROD=1` in the Blueprint accounts for Render's
proxy; use the actual trusted hop count if your network topology differs. Runtime
uses only `appPassword` from `ADMIN_DATABASE_PROD`, never maintenance credentials.

Set `SESSION_SECRET_PROD`, `AUTH_THROTTLE_SECRET_PROD`, and `APP_ORIGIN_PROD` on
the service before the first deploy. The session secret keys the hash stored for
every session token, the throttle secret keys the hash that stands in for an
email address or a client address in `admin.login_throttles`, and the origin is
the public `https` address browsers load; startup refuses a short secret, a
plaintext origin, `COOKIE_SECURE_PROD=false`, or `COOKIE_SAMESITE_PROD=none`.
Generate the two secrets independently. Changing the session secret invalidates
every existing session; changing the throttle secret resets every open
failure window.

Verify `/health/live` and `/health/ready` return HTTP 200, `/` serves the React
app, and `/api/unknown` returns a JSON 404 rather than the SPA page. A browser
navigation to an application route must also serve the SPA. Static assets come
from `apps/web/dist`, produced by the Blueprint's build command. A missing web
build or unsafe/unavailable Admin database prevents startup. Runtime never runs
setup or migrations.

## Failure recovery and upgrades

Retry the same command with the same state file and resource name. An uncertain
creation outcome is reconciled by saved identity; setup refuses to create a
replacement while the original outcome is unknown. A conflicting resource is
not adopted. Fix a reported setting or credential mismatch without replacing
resources or resetting passwords.

If `STATE_LOCKED` remains after an interrupted process, first confirm no maintenance
process is running, then remove only the sibling `.lock` directory. Keep the
state JSON. A retry handles any saved temporary network-access cleanup before
starting new database work. If cleanup remains blocked, inspect that saved rule
in the Render dashboard and restore API access before retrying.

Back up the database and private state before upgrades. Update your checkout,
run `npm ci`, apply the release's pending Admin migrations, and deploy its
matching application version. Applied migration files must not be edited.
If the release's changelog names a one-off script in `apps/api/src/scripts/sql/`,
run it as `nap-admin` with the API stopped before migrating; otherwise
`db:migrate:admin` stops with a checksum mismatch.
Database setup and migration never seed application data or reset credentials.

Provider operations have automated fixture coverage. A fresh live Render
installation must be verified separately before claiming production readiness.
The implementation follows Render's [database creation](https://api-docs.render.com/reference/create-postgres)
and [network access](https://render.com/docs/postgresql-creating-connecting) contracts.
