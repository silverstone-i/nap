# Verify NAP on Render

This runbook creates a separate PROD-mode NAP verification installation in the selected **My Workspace** in **Virginia**. It uses one Node web service for the API and built React client, one Render PostgreSQL instance for admin, and one instance for the first cell. It does not reuse or modify Seqori resources. The [database provisioning guide](database-provisioning.md#production-on-render) owns database recovery details.

## Review before creation

Use the repository's `render.yaml`: one `nap-verification` web service on `0.5c-512mb` (512 MB, $7/month). Admin setup and Register cell each create a `0.1c-256mb` PostgreSQL instance (256 MB, $6/month each) with 1 GB of storage. Render currently lists storage at $0.30/GB-month, so the planned baseline is about **$19.60/month** before bandwidth, build-minute overages, taxes, and plan changes. Confirm the current quote in Render before applying the Blueprint. Automatic deploys are off. This initial test disables the optional Redis authorization cache; PostgreSQL remains authoritative. Pricing: [Render pricing](https://render.com/pricing), [compute plans](https://render.com/docs/compute-plans).

Review the exact service definition and the chosen workspace/region before applying it. Creating the web service or either PostgreSQL instance is a paid action. No existing DEV or production database belongs to this procedure.

## Create the web service

After this preparation change is merged to `main`, open the [Render Blueprint creation page](https://dashboard.render.com/blueprint/new?repo=https://github.com/silverstone-i/nap), select **My Workspace**, and review `render.yaml`. Applying it creates only the web service. Record its `srv-...` ID and public URL. The first deploy is expected to fail readiness until admin provisioning is complete. The Blueprint contains no database instances because NAP's setup and Register cell operations create independently named, resumable instances. Later Blueprint syncs must not overwrite their credentials or saved operation state.

The service uses the repository root, `.nvmrc`/`NODE_VERSION=24.19.0`, `HUSKY=0 npm ci --include=dev && npm run build`, `node apps/api/dist/server.js`, and `/health/ready`. The explicit dev-dependency inclusion is required while `NODE_ENV=production` because the build uses TypeScript and Vite. `HUSKY=0` skips Git hook installation when the install prepare script invokes Husky; deployment builds do not need those hooks. It serves `/api/...` and the web client from the same origin. The production build must contain `apps/web/dist/index.html`; startup refuses a missing web build.

## Prepare admin from the operator machine

Use a private production configuration, not the checked-in `.env.example`. Set the Render API key, selected workspace ID, service ID, Virginia region, PostgreSQL 18, `0.1c-256mb` plan and 1 GB disk. Set `ROOT_TENANT_CODE_PROD`, `ROOT_COMPANY_PROD`, `ROOT_EMAIL_PROD` and a new root password for this isolated installation. Keep the local provisioning-state file private and backed up. The API key must be able to inspect the service, create PostgreSQL instances and update that service's environment variables. The local operator machine must be permitted to connect to the new database's external endpoint for migration and bootstrap.

Run the three explicit admin operations from the repository root:

```bash
npm run db:setup:admin -- --env prod
npm run db:migrate:admin -- --env prod
npm run db:bootstrap -- --env prod
```

`db:setup:admin` creates the first paid database. Do not create `nap_prod_admin` separately. Check each command's exit status; retain its saved provisioning state for retry. A rerun with matching bootstrap configuration preserves existing root credentials and records.

## Configure the web service and deploy

In the Render service's **Environment** page, set these private values without pasting them into Git, a shell command, or a ticket:

- `ADMIN_DATABASE_PROD`: a JSON object containing the admin entry's **internal** runtime endpoint, app password and admin password from the saved admin setup state.
- `NAP_PROVISION_STATE_PROD`: the saved admin provisioning state with that admin entry's maintenance endpoint changed to its internal endpoint for use by the running API. Preserve the operation ID, resource ID, credentials, and other saved fields. Keep the original external-endpoint state on the operator machine for CLI recovery.
- `CELL_DATABASES_PROD`: `{}` initially; the API updates this when cells are registered.
- `RENDER_API_KEY` and `RENDER_API_SERVICE_ID`: the same authorized key and new service ID used for setup. The Blueprint supplies the workspace, region, plan, disk and PostgreSQL version settings. It generates separate session and throttle secrets.

Do not copy the local state file verbatim if its admin endpoint is external: the running API should use Render's internal database endpoint. Treat all three database/state values as private; Blueprint sync does not own them. Trigger a manual deployment after these values are set. Confirm the latest deployment is live, `/health/live` and `/health/ready` return 200, `/` loads the web client, and `/api/unknown` remains an API error. Log in with the root identity.

## Register and verify the first cell

In **Tenant Management → Cells**, register a uniquely named first cell. The API creates the second paid PostgreSQL instance, applies migrations and reference seeds, loads its connection, then enables it. On completion, **Tenant Management → Tenants** should show the operator tenant assigned to that cell with projection and RBAC ready. Verify root login, the root no-employee exception, and tenant access. If bootstrap fails after cell success, the cell stays available; use **Retry bootstrap** on the operator tenant. Do not select a replacement cell.

Restart the web service and verify that the cell and operator tenant remain available. Then provision one ordinary tenant and test its administrator login. Review the Render deployment, service logs and both database statuses. Record browser/API evidence before marking the installation verified. No automatic cleanup or database reset is part of this flow; delete these exact NAP verification resources later only with a separate explicit instruction.
