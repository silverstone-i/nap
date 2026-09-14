# Verify NAP on Render

This runbook creates a separate PROD-mode NAP verification installation in the selected **My Workspace** in **Virginia**. It uses one Node web service for the API and built React client, one Render PostgreSQL instance for admin, and one instance for the first cell. It does not reuse or modify Seqori resources. The [database provisioning guide](database-provisioning.md#production-on-render) owns database recovery details.

## Review before creation

Use the repository's `render.yaml`: one `nap-verification` web service on `0.5c-512mb` (512 MB, $7/month). Admin setup and Register cell each create a `0.1c-256mb` PostgreSQL instance (256 MB, $6/month each) with 1 GB of storage. Render currently lists storage at $0.30/GB-month, so the planned baseline is about **$19.60/month** before bandwidth, build-minute overages, taxes, and plan changes. Confirm the current quote in Render before applying the Blueprint. Automatic deploys are off. This initial test disables the optional Redis authorization cache; PostgreSQL remains authoritative. Pricing: [Render pricing](https://render.com/pricing), [compute plans](https://render.com/docs/compute-plans).

Review the exact service definition and the chosen workspace/region before applying it. Creating the web service or either PostgreSQL instance is a paid action. No existing DEV or production database belongs to this procedure.

## Create the web service

After this preparation change is merged to `main`, open the [Render Blueprint creation page](https://dashboard.render.com/blueprint/new?repo=https://github.com/silverstone-i/nap), select **My Workspace**, and review `render.yaml`. Applying it creates only the web service. Record its `srv-...` ID and public URL. The first deploy is expected to fail readiness until admin provisioning is complete. The Blueprint contains no database instances because NAP's setup and Register cell operations create independently named, resumable instances. Later Blueprint syncs must not overwrite their credentials or saved operation state.

The service uses the repository root, `.nvmrc`/`NODE_VERSION=24.19.0`, `HUSKY=0 npm ci --include=dev && npm run build`, `node apps/api/dist/server.js`, and `/health/ready`. The explicit dev-dependency inclusion is required while `NODE_ENV=production` because the build uses TypeScript and Vite. `HUSKY=0` skips Git hook installation when the install prepare script invokes Husky; deployment builds do not need those hooks. It serves `/api/...` and the web client from the same origin. The production build must contain `apps/web/dist/index.html`; startup refuses a missing web build.

## Prepare admin from the operator machine

Use a private production configuration, not the checked-in `.env.example`. Set `RENDER_API_KEY` and `RENDER_API_SERVICE_ID` privately. Local PROD admin setup, migration and bootstrap read workspace, region, PostgreSQL version, plan and disk defaults from the single web service in the repository’s `render.yaml`. For those five settings, nonblank shell values override nonblank `.env` values, which override Blueprint values; blank placeholders fall through. `NAP_ENV_FILE` selects an alternative private environment file. Fully specified private settings do not require a Blueprint. DEV/TEST commands and server-side cell provisioning do not use this fallback. Set `ROOT_TENANT_CODE_PROD`, `ROOT_COMPANY_PROD`, `ROOT_EMAIL_PROD` and a new root password for this isolated installation. Keep the local provisioning-state file private and backed up. The API key must be able to inspect the service, create PostgreSQL instances and update that service's environment variables. The CLI discovers direct IPv4 egress through OpenDNS, temporarily allows that address as a /32, and removes only its own rule after each operation. HTTPS IP discovery is unsuitable when its proxy egress differs from PostgreSQL. DNS access to OpenDNS is required. Saved cleanup intent lets the next command remove a rule left by an interrupted process; retry promptly after interruption. Avoid concurrent dashboard allowlist edits while maintenance runs.

Run the three explicit admin operations from the repository root:

```bash
npm run db:setup:admin -- --env prod
npm run db:migrate:admin -- --env prod
npm run db:bootstrap -- --env prod
```

`db:setup:admin` creates the first paid database. Do not create `nap_prod_admin` separately. Configuration validation runs before setup opens state or contacts Render. Missing settings are reported together. Check each command's exit status; retain its saved provisioning state for retry. Failures after saving progress report the local state path without claiming a remote resource was created. A rerun with matching bootstrap configuration preserves existing root credentials and records.

## Configure the web service and deploy

Successful admin migration and bootstrap publish `ADMIN_DATABASE_PROD` with the internal endpoint and merge the admin entry into `NAP_PROVISION_STATE_PROD`, preserving existing cell state. They also supply missing `RENDER_API_KEY`, `RENDER_API_SERVICE_ID` and an initial empty `CELL_DATABASES_PROD`. Conflicting existing credentials or identities stop publication. No manual credential or state copying is required. The local recovery file retains the external endpoint. Blueprint settings and generated session secrets continue to be owned by Render.

Trigger a manual deployment after these values are set. Confirm the latest deployment is live, `/health/live` and `/health/ready` return 200, `/` loads the web client, and `/api/unknown` remains an API error. Log in with the root identity.

## Register and verify the first cell

In **Tenant Management → Cells**, register a uniquely named first cell. The API creates the second paid PostgreSQL instance, applies migrations and reference seeds, loads its connection, then enables it. On completion, **Tenant Management → Tenants** should show the operator tenant assigned to that cell with projection and RBAC ready. Verify root login, the root no-employee exception, and tenant access. If bootstrap fails after cell success, the cell stays available; use **Retry bootstrap** on the operator tenant. Do not select a replacement cell.

After Render reports availability, the API checks the internal PostgreSQL connection before configuring roles. Temporary connection failures are retried up to ten times with two-second delays; credential and permission failures stop immediately. If readiness still fails, use **Retry** on that same cell after checking its provider status. Saved resource identity and credentials are retained; do not register another cell to recover.

Restart the web service and verify that the cell and operator tenant remain available. Then provision one ordinary tenant and test its administrator login. Review the Render deployment, service logs and both database statuses. Record browser/API evidence before marking the installation verified. No automatic cleanup or database reset is part of this flow; delete these exact NAP verification resources later only with a separate explicit instruction.
