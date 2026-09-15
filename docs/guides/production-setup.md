# Production setup on Render

## 1. Prepare your fork and operator machine

Start with a fresh fork and a Render workspace where you can create paid services and manage their configuration. This procedure creates one web service, one admin PostgreSQL instance and one first-cell PostgreSQL instance. Use a dedicated installation: the admin database name defaults to `nap_prod_admin` (configurable in step 5), and cell names use `nap_prod_cell_<suffix>`, so changing the web service name alone does not isolate another installation in the same workspace.

Complete the [shared tool installation and fork setup](development-setup.md#1-install-tools-and-clone-your-fork) for macOS or Ubuntu, then return here. That section applies to both environments. Skip the sections marked development-only: production does not require a local PostgreSQL server or local database roles. Windows operators use Ubuntu through WSL2.

From the fork's root, verify:

```bash
nvm use
node --version
npm --version
openssl version
git remote -v
```

Confirm Node matches `.nvmrc` and `origin` points to your fork. Operator maintenance needs outbound HTTPS to Render, DNS access to OpenDNS at `208.67.222.222`, and outbound PostgreSQL access on port 5432. If a corporate network or VPN blocks these, resolve the network restriction before setup; do not open database access to all IPs.

## 2. Obtain your Render account settings

In the [Render Dashboard](https://dashboard.render.com/):

1. Select the intended workspace in the workspace switcher. Open its **Settings** and copy its workspace ID, beginning `tea-`. This is `RENDER_WORKSPACE_ID`, not a project or environment ID. Render documents its location in the [create-service API reference](https://api-docs.render.com/reference/create-service).
2. Open your account's **Account Settings → API Keys**, create a key, and save it in your password manager. The complete key is displayed only on creation. This is `RENDER_API_KEY`; see [Render API authentication](https://render.com/docs/api#1-create-an-api-key).
3. Ensure the account can inspect the chosen workspace's services, create PostgreSQL instances, update database access rules and update the web service's environment variables. Configure billing for the resources you select.

Keep the API key out of the Blueprint and Git. The web service ID is obtained after service creation in step 4; do not invent one or reuse another application's ID.

## 3. Customize the Blueprint in your fork

Open `render.yaml` in the repository root. The checked-in file contains a specific installation's values and **must be edited before use**. Change the following fields, retaining a single web service. Every field in this section belongs in `render.yaml`. “Env var” means an entry under the service’s `envVars` list in that YAML file; Render applies it to the hosted service. Local `apps/api/.env` configuration comes in step 5:

| Field                                        | Your fork's value                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Service `repo`                               | Your fork's full HTTPS repository URL.                                                                    |
| Service `branch`                             | Branch you will deploy, normally `main`.                                                                  |
| Service `name`                               | A unique name for this installation, for example `acme-nap-prod`.                                         |
| Service `region` and env var `RENDER_REGION` | The same supported Render region, for example `virginia`.                                                 |
| Env var `RENDER_WORKSPACE_ID`                | Your workspace's `tea-...` ID from step 2. Replace the existing ID and its installation-specific comment. |
| Service `plan`                               | Your chosen web compute plan; the current small baseline is `0.5c-512mb`.                                 |
| Env var `RENDER_POSTGRES_VERSION`            | Keep PostgreSQL major `18`.                                                                               |
| Env var `RENDER_POSTGRES_PLAN`               | Your chosen PostgreSQL compute plan; the current small baseline is `0.1c-256mb`.                          |
| Env var `RENDER_DISK_GB`                     | Your selected storage; `1` is the small baseline. NAP accepts 1 GB or a positive multiple of 5 GB.        |
| Env var `REDIS_CACHE_NAMESPACE_PROD`         | A namespace unique to the installation, for example `acme_nap_prod`.                                      |

Confirm selected plans and storage are offered in your region using [Render compute plans](https://render.com/docs/compute-plans) and [pricing](https://render.com/pricing). Web compute, each database and storage are billed separately. The small baseline is a starting configuration, not a capacity recommendation for a customer workload.

Keep the existing build/start commands, `/health/ready`, `NODE_ENV=production`, generated session/throttle secrets, secure cookie settings and one trusted proxy hop. Keep Redis disabled and automatic application deployments off for initial setup. There are no database declarations in this Blueprint: admin setup and cell registration create them.

Save and review the changes, then commit them to your fork's chosen deployment branch:

```bash
git diff -- render.yaml
git add render.yaml
git commit -s -m "Configure production Blueprint for this installation"
git push origin main
```

Replace `main` in the push command if you selected another branch. If your fork requires pull requests, merge this configuration there before proceeding. Confirm the remote branch contains your changes. Do not include private files in this commit.

## 4. Create the web service

In Render select **New → Blueprint**, connect your GitHub account if prompted, and grant Render access to your fork. Select that fork and the configured branch, with `render.yaml` at the repository root. Review the proposed service, workspace, region and plan before creating it. Do not use an upstream repository's prefilled deployment link. See [Render Blueprint setup](https://render.com/docs/infrastructure-as-code).

The Blueprint should create only your one web service. If it proposes modifying an existing unrelated resource, stop and correct the repository/name/workspace selection.

Open the created web service. Copy its `srv-...` identifier from the service's dashboard URL; for example the identifier in `https://dashboard.render.com/web/srv-...` is the service ID. Record this ID for entry as `RENDER_API_SERVICE_ID` in `apps/api/.env` in step 5. The Blueprint’s `exs-...` ID is a different identifier and is not needed in either configuration file. Record the public `https://...onrender.com` URL shown on the service page.

The first deployment can build successfully but fail startup/readiness because admin configuration does not exist yet. Continue to step 5 once the service exists and has an ID. A dependency/build error is a different failure: inspect **Events/Logs**, confirm the fork and branch, and fix it before continuing. Do not create a second service to recover a failed deployment.

## 5. Create private local configuration

From your fork's root:

```bash
test -e apps/api/.env || cp apps/api/.env.example apps/api/.env
chmod 600 apps/api/.env
git check-ignore apps/api/.env
```

The ignored path must be printed. Edit values in `apps/api/.env`, preserving existing private values and template keys/comments/order. It is safe for DEV and PROD values to coexist; maintenance commands explicitly select `--env prod`.

### Required entries in `apps/api/.env`

For a new installation, set these values in the private local file. On a retry, preserve the same service ID, root identity and credentials, and use the existing recovery state. Ordinary bootstrap reruns do not change the root password.

| Setting                                      | Local value                                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `RENDER_API_KEY`                             | API key saved in step 2. Successful maintenance publishes it to the service if missing; the API retains it for cell provisioning. |
| `RENDER_API_SERVICE_ID`                      | Web service’s exact `srv-...` ID recorded in step 4. Maintenance publishes it to the service if missing.                          |
| `ROOT_TENANT_CODE_PROD`, `ROOT_COMPANY_PROD` | Your company’s code and name for bootstrap records.                                                                               |
| `ROOT_EMAIL_PROD`, `ROOT_PASSWORD_PROD`      | Your root login email and a new 12–128-character password.                                                                        |

Set `ADMIN_DATABASE_NAME_PROD` in `apps/api/.env` before the first admin setup. It defaults to `nap_prod_admin`; use 1–63 lowercase letters, digits or underscores, starting with a letter. Setup, migration and bootstrap all use this value. Keep it unchanged for retries and subsequent maintenance: changing it does not rename a database or replace saved provisioning state. This setting is local to the maintenance CLI and is not a Blueprint environment variable.

### Infrastructure defaults for local commands

For these five settings, precedence is **nonblank shell → nonblank private file → `render.yaml`**. Leave their `.env` entries blank to use the Blueprint values configured in step 3:

- `RENDER_WORKSPACE_ID`
- `RENDER_REGION`
- `RENDER_POSTGRES_VERSION`
- `RENDER_POSTGRES_PLAN`
- `RENDER_DISK_GB`

The template includes a nonblank `RENDER_POSTGRES_VERSION`. Clear that local value to inherit the Blueprint, or make it match. Any nonblank local value overrides the Blueprint for local CLI commands only; it does not update the hosted service or `render.yaml`.

### Local placeholders and hosted values

For a newly copied `.env`, retain the placeholders below. If an existing file has populated PROD connection or recovery fields, establish which installation they belong to before proceeding; do not clear or repurpose another installation’s configuration. Keep its private configuration and state together. Cookie, proxy and Redis entries need no local edits for this hosted setup.

| Setting                                                                    | New local file                                    | Hosted value managed by                                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_DATABASE_PROD`                                                      | Blank.                                            | Setup/maintenance generates database configuration and publishes it to Render.                                       |
| `CELL_DATABASES_PROD`                                                      | `{}`; do not export it over a configured service. | Maintenance publishes initial `{}` if missing; Management fills it in Render.                                        |
| `NAP_PROVISION_STATE_PROD`                                                 | Blank.                                            | Maintenance stores private recovery state in Render environment variables. Never copy it into Git or Blueprint YAML. |
| `SESSION_SECRET_PROD`, `AUTH_THROTTLE_SECRET_PROD`                         | Blank.                                            | Blueprint `generateValue` creates hosted secrets.                                                                    |
| `COOKIE_SECURE_PROD`, `COOKIE_SAMESITE_PROD`, `TRUST_PROXY_HOPS_PROD`      | No local edit required.                           | Blueprint supplies `true`, `lax`, `1`, as retained in step 3.                                                        |
| `REDIS_CACHE_ENABLED_PROD`, `REDIS_CACHE_NAMESPACE_PROD`, `REDIS_URL_PROD` | No local edit required.                           | Blueprint supplies `false` and the namespace chosen in step 3; no Redis URL is needed for the baseline.              |

Local cookie, proxy and Redis values do not configure the hosted API. Runtime configuration on Render comes from service environment variables.

For first-time setup, generate the root password with `openssl rand -hex 32` in a private terminal, or use your password manager. Store it and paste it into the private file. No shell command should contain the API key or password. Quote dotenv values containing spaces or `#`; do not source this file in a shell.

For settings outside the five infrastructure defaults above, inherited variables can override the private file, including blanks; remove conflicting exports in the terminal that runs maintenance. Opening a fresh terminal alone is insufficient if shell startup files export those settings. Never print secret values while checking overrides. Fully explicit infrastructure settings can operate without a Blueprint, but this guide uses the customized Blueprint to keep the local CLI and hosted API consistent. Shell/file overrides do not update the Blueprint or the running service's infrastructure choices.

`NAP_ENV_FILE` can select another private file for maintenance. `NAP_PROVISION_STATE` can select another local recovery path; by default it is `apps/api/.env.provisioning.prod.json`. An alternative configuration file does not automatically isolate its recovery file. Use the same file pair for all three commands and retries.

## 6. Create, migrate and bootstrap admin

Run from the fork's root, one command at a time:

```bash
npm run db:setup:admin -- --env prod
```

Expect a successful JSON result after build output. This creates the paid admin instance named by `ADMIN_DATABASE_NAME_PROD`, saves generated passwords and resource identity, and prepares `nap_admin` for maintenance and restricted `nap_app` for runtime. Do not create the database manually in Render.

```bash
npm run db:migrate:admin -- --env prod
```

Expect successful migration completion. This applies schema and runtime grants and publishes the internal admin connection and recovery state to the selected web service.

```bash
npm run db:bootstrap -- --env prod
```

Expect bootstrap completion. Root identity, operator tenant, membership and policy now exist; cell-dependent bootstrap waits for the first cell. Maintenance preserves existing service cell entries and supplies missing provisioning credentials/configuration. No manual copying of generated database passwords or state is required.

Each command temporarily permits only the operator's direct public IPv4 as a `/32`, then removes its own rule, preserving unrelated rules. It uses OpenDNS because an HTTPS proxy's egress can differ from the PostgreSQL connection's egress. External PostgreSQL uses TLS `verify-full`. Interrupted cleanup is recorded for the next maintenance command to recover. Avoid concurrent dashboard access-list edits during maintenance.

If any command exits nonzero, stop and follow the failure table below. An available Render instance alone does not mean NAP setup finished. Keep the local state file: rerun the same command against the same instance and identity. In Render, confirm the admin database is available and no operation-owned temporary access rule remains after success.

## 7. Deploy and sign in

In the web service's **Environment** page, confirm the names `ADMIN_DATABASE_PROD`, `NAP_PROVISION_STATE_PROD`, `RENDER_API_KEY`, `RENDER_API_SERVICE_ID` and `CELL_DATABASES_PROD` exist alongside Blueprint settings. Do not expose their values in screenshots or logs.

Use the service's **Manual Deploy** action to deploy the configured branch's latest commit. Wait for **Live**. Replace the example hostname below with your recorded public URL:

```bash
curl --fail https://YOUR-SERVICE.onrender.com/health/live
curl --fail https://YOUR-SERVICE.onrender.com/health/ready
```

Both must return HTTP 200. Open that same HTTPS origin in a browser and sign in with your configured root email and password. `/api/unknown` should return an API error, not the HTML login page. If deployment is live but login fails, check bootstrap completion and your saved root credentials; an ordinary bootstrap rerun does not reset the password.

## 8. Create the first cell and verify recovery

Open **Tenant Management → Cells → Register cell**. Enter `primary`, verify the preview `nap_prod_cell_primary`, and select **Register cell** once. This creates the second paid database on the plan and disk size configured on the service.

Wait for **Enabled**. The API creates roles, applies migrations, seeds required reference data, saves credentials and connections, and activates the cell. It waits for the internal database connection after Render reports availability, retrying temporary connection failures up to ten times with two-second delays. A queued or running status is not completion. If registration fails, correct the reported cause and select **Retry** on that same cell row. The retry uses the saved resource; do not register another suffix or create a replacement database.

In **Tenant Management → Tenants**, verify your operator tenant has completed bootstrap and its projection and RBAC are ready. Use **Retry bootstrap** if only that step failed. Root intentionally has no employee record. Click **Dashboard** in the left navigation and confirm it opens for your operator company.

On the service's **Deploys** page, use **Manual Deploy → Restart service** ([Render restart instructions](https://render.com/docs/deploys#restarting-a-service)). Wait for Live and repeat both health checks, root login and the enabled-cell/operator-tenant checks. Saved connections are retrieved on startup; do not rerun setup or recreate the cell for a restart.

### Verify ordinary-tenant access

Complete this check before declaring ordinary-tenant provisioning and administrator access verified. The operator login and restart checks above verify the base installation only. If you defer this check, record ordinary-tenant acceptance as unverified.

This check creates persistent tenant, employee and login records in the production cell. Use a deliberately named acceptance tenant and an email address you control. Retain those records for acceptance testing, or manage them afterward through the supported tenant/user lifecycle controls; they are not automatically removed.

1. Open **Tenant Management → Tenants → Create tenant**.
2. Supply the tenant code and name, select a tier and the enabled cell, then
   choose **Create pending tenant**.
3. Open the tenant and choose **Create or link portal user**.
4. Choose the tenant, select `employee` under **Relationship**, and enter the
   employee name and portal-user email. Supply a temporary password for a new identity.
5. Select **Provision user** and wait for the membership to be ready.
6. Open the tenant and choose **Activate tenant**. Select that employee under
   **Initial administrator**, then choose **Verify and activate**.
7. Wait for provisioning to finish. Test the administrator login in a separate
   browser session and complete any required temporary-password change.
8. Confirm the administrator can enter that tenant.

This check uses the existing cell and creates no additional database.

Reference seeds are platform data. No standalone production sample-data command is part of this procedure.

## 9. Subsequent deployments, backups and recovery

Keep automatic deployments off until you have an upgrade procedure for your release. Before upgrades, back up databases using your provider's backup/export facilities and retain private configuration and recovery state securely. Database backups and provisioning state serve different purposes; neither replaces the other. Confirm your selected Render plan's backup/retention features rather than assuming them.

Update your fork/operator checkout to the intended release and run `npm ci`. Follow that release's migration instructions; run `npm run db:migrate:admin -- --env prod` when admin migrations are required, then deploy the matching application version in the instructed order. Existing cells require the release's explicit migration procedure; restarting or registering another cell is not an upgrade procedure. Stop if a release requires a cell migration but supplies no supported operational instructions.

Blueprint syncs can overwrite settings defined in YAML. Keep generated connection maps, passwords and recovery state out of the Blueprint. Review any changed settings before syncing; existing environment values not overwritten by the Blueprint are retained, as described in [Render's Blueprint lifecycle](https://render.com/docs/infrastructure-as-code#modifying-a-resource-outside-of-its-blueprint).

| Failure                                            | Next action                                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing settings or malformed Blueprint            | Correct the listed keys or the customized Blueprint. Preflight stops before provisioning state is opened.                                                     |
| Workspace/region/service mismatch                  | Check your fork's Blueprint, selected workspace and service ID. Do not change resource identity to bypass validation.                                         |
| API refusal                                        | Check API key access and billing in Render. Retry the same operation after correction.                                                                        |
| Connection closed, timeout or unavailable database | Check Render status, operator DNS/TCP access and saved progress. Rerun the same admin command or use Retry on the same cell. Never allow `0.0.0.0/0`.         |
| Temporary access cleanup failure                   | Retry promptly from the same private state so owned-rule cleanup can resume. Inspect provider access rules; preserve unrelated entries.                       |
| Password, role privilege or ownership mismatch     | Preserve credentials and state; investigate the intended instance and existing roles. Do not rotate, grant superuser or adopt another database as a shortcut. |
| Migration failure                                  | Preserve the migration ledger and fix the underlying error. Baselines do not run over incompatible historical ledgers.                                        |
| Bootstrap failure after cell success               | Use Retry bootstrap on the operator tenant; keep the available cell.                                                                                          |
| Saved-state lock                                   | Stop duplicate operator commands. Verify no owner process is running before removing an old lock lacking PID metadata.                                        |
| Uncertain creation outcome                         | Reconcile the saved operation against Render; retry later if necessary. Do not discard state, reset creation flags or create a replacement resource.          |
| Lost local state                                   | Restore its private backup and verify identities before continuing. Do not reconstruct passwords or operation IDs by guessing.                                |
| Forgotten root password                            | Explicit recovery only: update the private root password and run `npm run db:bootstrap -- --env prod --reset-root-password`.                                  |

Failures after saved progress identify the local recovery path; this is not proof of which remote resources were created. Keep the default state file private and backed up. Production cell recovery lives in `NAP_PROVISION_STATE_PROD` on the service. No resource deletion, data reset or credential rotation is part of normal retry.

## Verification record

The existing installation completed admin setup/migration/bootstrap, first-cell reference seeding and operator bootstrap, safe retries, temporary-access cleanup and deployment restart checks on 2026-09-14. Its physical database identity, role privileges and runtime login were checked. That is evidence for those operations on that installation, not proof of this guide from a new fork.

A fresh-fork production walkthrough and ordinary-tenant acceptance remain **unverified**. No additional paid resources were created to validate these documentation changes. Render account/Blueprint steps were checked against the official sources linked above; the macOS/Ubuntu distinction in the development verification record also applies to operator-machine preparation.
