# Render verification

## Outcome

Verify a separate NAP installation in the selected Render workspace (Virginia) using one same-origin Node web service, an independently provisioned admin PostgreSQL database, and a first independently provisioned cell. Use the existing PROD infrastructure adapter and no existing Seqori resources.

## Accepted design

The platform specification's web build, database provisioning and environment configuration contracts govern. ADR 0011 owns one API with multiple cells; ADR 0014 permits the API service to hold provisioning credentials; ADR 0015 owns first-cell operator bootstrap. This is deployment composition, not a new tenancy architecture.

## Current gap and changes

The API serves only JSON routes and there is no Render service definition. Add production-only Vite asset serving on the API origin, a Render Blueprint for one Node web service, and a production runbook. Correct stale environment-template comments to match ADR 0014 without changing variable names, order, or values. The admin setup CLI creates its database using the existing Render adapter; Register cell creates the first cell. Redis caching may be disabled for the initial verification.

## Risks and recovery

The new service cannot pass readiness until the admin database is provisioned, migrated and bootstrapped. Provisioning state contains credentials and operation identity; back it up privately. Keep automatic deploys off while preparing. Stop before paid resource creation and review exact Render plan, region and costs. No existing NAP or Seqori environment is an input. A failed first deployment is corrected by supplying its configuration and redeploying; no database reset is part of recovery.

## Sequence and evidence

One local capability change followed by a separate, approved Render creation/verification step. Locally verify API/static routing, deep links, unknown paths, build output, and existing tests; validate the Blueprint. On Render, verify service health, root login, first-cell creation, automatic bootstrap, restart recovery and tenant provisioning, recording live evidence before calling the installation verified.

## Local preparation evidence

Preparation is Verified upon merge of [PR #26](https://github.com/silverstone-i/nap/pull/26)
with required checks passing. This status does not complete the live Render gate.
Render's published Blueprint JSON Schema accepted `render.yaml`. The unit HTTP fixture and a smoke test using the actual built API and Vite output covered the entry page, deep links, assets, API 404 and missing build behavior. The final full local rerun passed all 491 tests, lint, typecheck, build, formatting, licenses and diff check. An earlier full run had one intermittent failure in the untouched workbook-body empty-request case (401 instead of 400); that file passed alone and the full rerun passed. The `.env` and `.env.example` comment/key order matches; no configuration values changed. No Render service or database was created. Live deployment and browser verification remain pending the explicit resource-creation step.
