# Development setup

## 1. Install tools and clone your fork

This section applies to both development and production. Production readers: complete step 1, then return to the remaining checks in [Production setup, step 1](production-setup.md#1-prepare-your-fork-and-operator-machine). Steps 2–7 below are for development only.

Use a normal user account, not root. Commands below run in Terminal on macOS or a Bash terminal on Ubuntu. On Windows, [install Ubuntu through WSL2](https://learn.microsoft.com/en-us/windows/wsl/install), then run the Ubuntu commands inside it and keep the checkout in your Linux home directory.

### macOS

Install Apple's command-line tools if missing:

```bash
xcode-select --install
```

Finish the installer before continuing. Install [Homebrew](https://brew.sh/) using its installation instructions, including the displayed shell configuration step. Then:

```bash
brew install git openssl@3
export PATH="$(brew --prefix openssl@3)/bin:$PATH"
```

Add that PATH line to `~/.zshrc` so new terminals use the same tools.

### Ubuntu

Install the shared prerequisites:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates build-essential python3 openssl
```

### Both platforms

On GitHub, fork the NAP repository into your account. Copy your fork's HTTPS clone URL from its **Code** menu. Replace `YOUR_ACCOUNT` below before running:

```bash
git clone https://github.com/YOUR_ACCOUNT/nap.git
cd nap
git remote -v
```

`origin` must identify your fork. All subsequent repository commands run from this directory unless stated otherwise.

Before committing changes, configure the author identity for this checkout. Replace both example values with your own name and GitHub-associated email (or GitHub noreply email):

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

For HTTPS pushes, authenticate with a Git credential manager or a GitHub personal access token when Git prompts for a password. A GitHub account password cannot authenticate Git operations. Keep tokens out of remote URLs and command arguments. See [GitHub HTTPS authentication](https://docs.github.com/en/get-started/git-basics/about-remote-repositories#cloning-with-https-urls).

Install [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) if `command -v nvm` finds nothing:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh | bash
```

Open a new terminal, return to the checkout, then:

```bash
nvm install
nvm use
node --version
npm ci
openssl version
```

Node must match `.nvmrc` (currently 24.19.0), and `npm ci` must finish successfully. If a command is missing, correct the installation or PATH before continuing. Do not replace the lockfile to bypass an installation failure.

## 2. Development only: install PostgreSQL and create the maintenance login

Production uses Render's PostgreSQL and does not require a local server or local role setup. Skip this section for production.

### Install PostgreSQL 18

On macOS:

```bash
brew install postgresql@18
export PATH="$(brew --prefix postgresql@18)/bin:$PATH"
```

Add that PATH line to `~/.zshrc`. The [PostgreSQL formula](https://formulae.brew.sh/formula/postgresql@18) installs both server and client tools.

On Ubuntu:

```bash
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
sudo apt update
sudo apt install -y postgresql-18 postgresql-client-18
export PATH="/usr/lib/postgresql/18/bin:$PATH"
```

Add the PATH line to `~/.bashrc`. Follow the repository setup prompts for your Ubuntu release; see [PostgreSQL's Ubuntu instructions](https://www.postgresql.org/download/linux/ubuntu/) if it is unsupported. Do not substitute Ubuntu's unversioned PostgreSQL package without checking its major version.

On either platform, run `psql --version` and confirm major 18 before continuing.

### Start PostgreSQL and create the maintenance login

This path assumes a new, dedicated local PostgreSQL instance. Do not reuse another installation's NAP roles with different passwords. PostgreSQL roles are shared across databases on the same instance.

On macOS:

```bash
brew services start postgresql@18
pg_isready -h localhost -p 5432
psql -X -d postgres
```

Homebrew's initial administrator normally uses your macOS account name. On Ubuntu:

```bash
sudo systemctl start postgresql
pg_lsclusters
pg_isready -h localhost -p 5432
sudo -u postgres psql -X -p 5432 -d postgres
```

The Ubuntu cluster listing must show version 18 online on port 5432. If another version occupies that port, stop here and select a dedicated version-18 instance; use its port consistently in subsequent commands and environment endpoints. On WSL without systemd, use `sudo service postgresql start` instead.

In the administrator's `psql` prompt, run the following block only if `nap_admin` does not exist. If it already exists, skip both `CREATE ROLE` and `\password`; verify its privileges with the query below and use its existing password. For a new login:

```sql
CREATE ROLE nap_admin LOGIN NOSUPERUSER CREATEDB CREATEROLE
  INHERIT NOREPLICATION NOBYPASSRLS;
\password nap_admin
\q
```

The [psql password command](https://www.postgresql.org/docs/18/app-psql.html) prompts without echoing the password. Choose a unique password and keep it in a password manager; enter exactly this value as `NAP_ADMIN_PSWD_DEV` in the next step. Setup creates `nap_app` itself when missing.

Verify TCP authentication from your regular terminal:

```bash
psql -X -h localhost -p 5432 -U nap_admin -d postgres -W -c \
  "SELECT current_user, rolcanlogin, rolcreatedb, rolcreaterole, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;"
```

Expect `nap_admin`, three `t` values followed by two `f` values. A connection or authentication failure must be fixed before running NAP setup. Do not enable trust authentication or grant superuser privileges to bypass it.

## 3. Configure the private development file

From the repository root, create the file only if it does not already exist:

```bash
test -e apps/api/.env || cp apps/api/.env.example apps/api/.env
chmod 600 apps/api/.env
git check-ignore apps/api/.env
```

The last command must print the private path. Open `apps/api/.env` in your editor. Preserve the template's keys, comments and order; change values only. Do not overwrite an existing private file with the template.

The table describes first-time DEV setup. If this file already configures an initialized DEV installation, preserve its database passwords, secrets, root identity and populated cell map. Verify its endpoints identify that installation. Resume a failed setup with the same values and recovery state; do not generate replacement credentials during a retry. Existing PROD and TEST values remain unchanged.

| DEV setting                                                             | Value to supply                                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `NAP_ADMIN_PSWD_DEV`                                                    | Exact password assigned to `nap_admin` above.                                                                                        |
| `NAP_APP_PSWD_DEV`                                                      | For a new runtime login, choose a password different from the maintenance password. For an existing login, use its current password. |
| `PORT`                                                                  | Set `3000` in the local file for the Vite proxy used in step 5.                                                                      |
| `SETUP_DATABASE_DEV`                                                    | `localhost:5432/postgres`, using your selected PostgreSQL port.                                                                      |
| `ADMIN_DATABASE_DEV`                                                    | `localhost:5432/nap_dev_admin`, on the same instance.                                                                                |
| `CELL_DATABASES_DEV`                                                    | Start with `{}` for a new installation; preserve an existing populated map. Cell registration updates it automatically.              |
| `SESSION_SECRET_DEV`, `AUTH_THROTTLE_SECRET_DEV`                        | Independently generated secrets, each at least 32 characters.                                                                        |
| `ROOT_TENANT_CODE_DEV`                                                  | Your operator tenant code, for example `ACME`.                                                                                       |
| `ROOT_COMPANY_DEV`                                                      | Your operator company's name, for example `Acme Development`.                                                                        |
| `ROOT_EMAIL_DEV`                                                        | Email you will use to sign in as root.                                                                                               |
| `ROOT_PASSWORD_DEV`                                                     | New root password, 12–128 characters; store it privately.                                                                            |
| `COOKIE_SECURE_DEV`, `COOKIE_SAMESITE_DEV`, `TRUST_PROXY_HOPS_DEV`      | Keep `false`, `lax`, `0` for local HTTP.                                                                                             |
| `REDIS_CACHE_ENABLED_DEV`, `REDIS_URL_DEV`, `REDIS_CACHE_NAMESPACE_DEV` | Keep `false`, blank, `nap_dev`. No Redis installation is required for this baseline.                                                 |

For each newly generated secret, run `openssl rand -hex 32` separately in a private terminal and paste its output into the intended field. This also produces a suitable database password. It does not set a PostgreSQL password: `NAP_ADMIN_PSWD_DEV` must still match the password entered with `\password`. Never paste secrets into Git, issues or shared logs. Quote values containing spaces or `#` using dotenv syntax; do not `source` the file as shell code.

Run this block in every terminal that will run setup commands or start the API or web process, including newly opened terminals in step 5. `unset` affects only the current shell; a new terminal can reload exports from shell startup files:

```bash
unset NODE_ENV NAP_ENV_FILE NAP_PROVISION_STATE PORT
unset SETUP_DATABASE_DEV ADMIN_DATABASE_DEV CELL_DATABASES_DEV
unset NAP_ADMIN_PSWD_DEV NAP_APP_PSWD_DEV
unset SESSION_SECRET_DEV AUTH_THROTTLE_SECRET_DEV
unset ROOT_TENANT_CODE_DEV ROOT_COMPANY_DEV ROOT_EMAIL_DEV ROOT_PASSWORD_DEV
unset COOKIE_SECURE_DEV COOKIE_SAMESITE_DEV TRUST_PROXY_HOPS_DEV
unset REDIS_CACHE_ENABLED_DEV REDIS_URL_DEV REDIS_CACHE_NAMESPACE_DEV
```

Runtime loads `apps/api/.env`; inherited variables take precedence, including blank values. `NAP_ENV_FILE` and `NAP_PROVISION_STATE` are maintenance overrides, not a substitute for configuring the runtime's standard file. Leave TEST and PROD sections unused for this walkthrough.

## 4. Set up, migrate and bootstrap admin

Run each command separately from the repository root. Continue only after it exits successfully:

```bash
npm run db:setup:admin -- --env dev
```

Setup creates `nap_dev_admin`, prepares the roles and saves private recovery state at `apps/api/.env.provisioning.dev.json`.

```bash
npm run db:migrate:admin -- --env dev
```

Migration applies the current admin migrations and runtime grants. Do not rely on a fixed migration count.

```bash
npm run db:bootstrap -- --env dev
```

Bootstrap creates the root identity, operator tenant, membership and initial platform policy. Cell-dependent operator bootstrap waits for the first cell. No cell CLI or separate seed command is needed.

These commands report their result as JSON after build output. A nonzero exit or `Database operation failed` means stop, fix the reported cause and rerun that same command with the same state. Successful reruns preserve records and passwords; do not delete state to retry.

## 5. Start the application and register the first cell

In one terminal at the repository root, run the override-clearing block in step 3, then:

```bash
nvm use
NODE_ENV=development npm run dev:api
```

Wait for API startup. In another terminal at the repository root, run the same override-clearing block, then:

```bash
nvm use
npm run dev:web
```

Open the URL Vite prints, normally `http://localhost:5173`. The browser uses Vite's `/api` proxy to the API on port 3000. Keep the API on 3000 for this baseline; opening port 3000 directly does not serve the development web client.

In a third terminal:

```bash
curl --fail http://localhost:3000/health/live
curl --fail http://localhost:3000/health/ready
```

Both must return HTTP 200. If startup or readiness fails, inspect the API terminal and complete admin migration before continuing.

Sign in using `ROOT_EMAIL_DEV` and `ROOT_PASSWORD_DEV`. Open **Tenant Management → Cells → Register cell**, enter `primary` in **Cell name suffix**, confirm the preview is `nap_dev_cell_primary`, then select **Register cell** once.

Wait until the cell shows **Enabled**. Registration automatically creates the database, migrates it, seeds reference data, saves its connection and activates it. A queued or running status is not completion. If it fails, use **Retry** for that same row after correcting the reported cause; do not register another name.

Open **Tenant Management → Tenants** and inspect your operator tenant. Bootstrap must be complete with projection and RBAC ready. If bootstrap alone fails, use **Retry bootstrap** on that tenant. Root is intentionally an identity without an employee record. Reference seeds are required platform data; this procedure does not create demonstration customers, projects or accounting transactions.

Click **Dashboard** in the left navigation and confirm it opens for your operator company. With one membership, there is no tenant-selection menu to use. Stop API and web with Ctrl-C, restart them using the same commands, and verify health, root login, the enabled cell and operator tenant again. No setup rerun should be needed for ordinary startup.

## 6. Updates, recovery and development cleanup

Before an upgrade, stop the application, back up databases and the private environment/state files, review the release's migration requirements, update your checkout and run `npm ci`. Apply admin migrations with `npm run db:migrate:admin -- --env dev`, then start the matching API and web versions. Existing cells require the release's explicit cell-upgrade procedure; do not assume restarting migrates them or invent a cell CLI. If the release supplies no procedure for a required cell migration, stop before applying that upgrade.

Legacy cell registrations require the forward admin migration and a verified physical database mapping. Never erase a migration ledger to force a baseline onto populated databases. Existing UUIDs and assignments must be preserved.

| Failure                                          | Recovery                                                                                                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Authentication or role mismatch                  | Verify the instance, port and existing role passwords. Do not rotate passwords to make setup pass.                                                                                               |
| State lock                                       | Stop duplicate commands. Dead-process locks are reclaimed; remove an older lock without ownership metadata only after confirming no operator process is running.                                 |
| Uncertain creation or physical identity mismatch | Preserve state and inspect the selected database's owner and operation identity. Do not reset creation flags or adopt an unrelated database.                                                     |
| Failed cell or bootstrap                         | Retry the same cell or the tenant's bootstrap action, respectively. Closing the browser does not cancel a running job.                                                                           |
| Forgotten root password                          | Explicit recovery: update the private root password and run `npm run db:bootstrap -- --env dev --reset-root-password`. This deliberately changes the root password; ordinary bootstrap does not. |

For an intentionally empty DEV environment, stop the API and check `SETUP_DATABASE_DEV` identifies your dedicated development instance. Then:

```bash
npm run db:clean:dev -- --confirm
```

This permanently deletes `nap_dev_admin` and every `nap_dev_cell_*` database owned by `nap_admin` on that instance, including partial cells. It removes the DEV state file and clears the local cell map. Roles and their passwords remain. Unrelated owners cause cleanup to stop. Cleanup is not transactional: if interrupted, correct the failure and rerun it. Repeat steps 4–5 afterward. Never use this operation for production recovery.

## 7. Run repository checks separately

Application setup does not prepare a shared TEST database. The test suite uses disposable fixtures; never point TEST at DEV or PROD. PostgreSQL 18 tools `initdb`, `pg_ctl` and `psql` must be on PATH. Run as a normal user with permission to open local sockets; do not use `sudo npm test`. Remove inherited TEST connection overrides unless you are deliberately configuring an isolated test server. Fixed PostgreSQL roles cannot have different DEV and TEST passwords on one shared instance.

From the repository root:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
npm run licenses
git diff --check
```

The license gate checks installed production dependencies, including hoisted transitives, against `.licenses-allowed.json` and the lockfile. Unknown licenses and missing required packages fail.

Each must exit zero. A failing check is a failure to investigate, not a reason to reset application databases.

## Verification record

Checked on macOS on 2026-09-14 using a fresh source archive of v0.19.2, a new private environment file and a disposable PostgreSQL 18 cluster. `npm ci`, admin setup, migration and bootstrap succeeded. Browser verification covered root login, registering `primary`, Enabled status, completed operator bootstrap, confirmed projection, ready RBAC and Dashboard access. After stopping and restarting both development processes, health checks returned 200, fresh root login succeeded and the same cell and reference seeds were ready. The documented DEV cleanup command then removed the disposable databases and recovery state; the temporary cluster was stopped.

Isolation used PostgreSQL port 55439, API port 3139 and Vite port 5193, with the disposable copy's Vite proxy adjusted accordingly. The repository's application/configuration files and existing databases were not changed. This verifies the application lifecycle with installed macOS tools; it does not claim a fresh macOS/Homebrew installation, a GitHub fork creation test or an Ubuntu/WSL installation test. Ubuntu package commands and provider instructions were checked against the linked official documentation.
