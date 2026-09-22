# Development database setup

## Prerequisites

Install Git, Node using the version in `.nvmrc`, npm, and PostgreSQL 18. On macOS,
PostgreSQL is available through `brew install postgresql@18`; start the server
with `brew services start postgresql@18`. On other systems, use the
[PostgreSQL installers](https://www.postgresql.org/download/).

Install [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) if needed,
then clone your fork and install the pinned Node version and dependencies:

```sh
git clone https://github.com/YOUR_ACCOUNT/nap.git
cd nap
nvm install
nvm use
npm ci
```

Replace `YOUR_ACCOUNT` with your GitHub account. The commands below run
from the repository root. This guide installs the empty Admin database; it does
not create a root user, seed data, or provide login or cell management.

## Prepare local roles

Connect to your local PostgreSQL server using its administrative account. Create
these roles only if absent; preserve existing credentials and compatible roles:

```sql
CREATE ROLE "nap-admin" LOGIN NOSUPERUSER NOBYPASSRLS NOREPLICATION CREATEDB CREATEROLE;
CREATE ROLE "nap-app" LOGIN NOSUPERUSER NOBYPASSRLS NOREPLICATION NOCREATEDB NOCREATEROLE NOINHERIT;
```

In `psql`, set passwords interactively using `\password nap-admin` and
`\password nap-app`. Generate independent passwords with `openssl rand -hex 32`.
Do not place passwords in shell arguments or commit them. The runtime role must
own no objects and have no role memberships. Setup rejects incompatible roles
instead of changing their credentials or privileges.

## Configure the application

```sh
cp -n apps/api/.env.example apps/api/.env
chmod 600 apps/api/.env
```

Edit the DEV values in this private file:

- `ADMIN_DATABASE_DEV`: `localhost:5432/nap_dev_admin`.
- `SETUP_DATABASE_DEV`: `localhost:5432/postgres`.
- `NAP_ADMIN_PSWD_DEV` and `NAP_APP_PSWD_DEV`: the passwords you established.
- `SESSION_SECRET_DEV`: at least 32 characters from `openssl rand -hex 32`.
- `AUTH_THROTTLE_SECRET_DEV`: a second, independently generated value of at
  least 32 characters. It keys the hash that stands in for an email address or
  a client address in `admin.login_throttles`, and it is separate from the
  session secret so that leaking either one does not compromise both.
- `APP_ORIGIN_DEV`: `http://localhost:5173`, the Vite server the browser talks
  to. Every state-changing `/api` request must prove it came from this origin,
  so the API's own port is the wrong value here.

`ARGON2_MEMORY_KIB`, `ARGON2_TIME_COST`, and `ARGON2_PARALLELISM` are shared by
every environment and default to 19456, 2, and 1. They are floors: startup
refuses a lower value, and raising one makes each account rehash its password
on its next successful login.

Endpoints omit usernames, passwords, and the protocol prefix. Maintenance and
target endpoints must use the same host, port, and connection options. An
explicit `NAP_ENV_FILE` selects another private file. Inherited environment
variables take precedence over file values.

## Set up and migrate

```sh
npm run db:setup:admin -- --env dev
npm run db:migrate:admin -- --env dev
```

Setup creates or verifies the database, ownership, role attributes, and grants.
Migration installs the twelve Admin tables, constraints, triggers, and migration
ledger, then verifies the installed contract. Repeat both commands to verify
safe reuse: each reports `unchanged` when no work remains. A failure returns a
nonzero exit code and a safe code; fix the configuration and retry the same target.
Do not delete the database or change passwords as a retry procedure.
If migration reports a checksum mismatch after an update, check the changelog for
a one-off script in `apps/api/src/scripts/sql/` and run it as `nap-admin`, or
recreate a disposable development database.

Run `npm run dev:api` and `npm run dev:web` for the existing development servers.
`/health/live` proves process liveness; `/health/ready` checks the Admin database
and runtime permissions. Startup requires completed setup and migration but never
runs them itself. Development keeps Vite separate; production serves the built
web app through the BFF.

## Run database tests

Use an isolated PostgreSQL 18 server, never a development or production server.
Tests create temporary databases and temporarily modify the fixture's fixed
`nap-admin` and `nap-app` roles. The fixture's administrative account must be
able to create/drop databases and roles. Store its URL in `FOUNDATION_TEST_URL`
through your private shell environment, then run:

```sh
npm run test:db
```

The fixture role passwords are `foundation-admin` and `foundation-app`; existing
roles on the isolated server must match. Ordinary `npm test` does not require a
database. CI supplies its own disposable PostgreSQL service.

To skip provisioning a fixture server by hand, run `npm run test:db:local`
instead. It uses the `initdb`/`pg_ctl` binaries from a local PostgreSQL 18
install to start a throwaway cluster on a free port, points `FOUNDATION_TEST_URL`
at it, runs `npm run test:db`, and tears the cluster down afterward — leaving
your development database untouched.
