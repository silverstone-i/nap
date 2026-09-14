# Production maintenance automation

Implement the owner's approved production automation request under the specification's database provisioning and environment configuration contracts and ADRs 0013–0015.

## Delivery

1. Verify existing Render identities; preserve saved operation IDs, credentials and resources.
2. Add CLI-owned temporary external access for setup, migration and bootstrap. Discover direct IPv4 egress using DNS, allow only /32, save cleanup intent before mutation, remove only owned rules, and retry stale cleanup on the next command.
3. Use explicit verify-full for external maintenance. Report safe operation-specific failures.
4. Publish the verified admin internal connection and merge admin recovery state into Render service variables without overwriting cell state or deploying.
5. Validate isolated failure/retry fixtures and repository checks, then run the existing production admin lifecycle. Stop for an additional paid cell or deployment approval if required for live cell seeding.

## Evidence

Read-only live probes confirmed service/workspace/database identity. HTTPS and DNS public egress differ on this operator machine. DNS-address /32 access succeeds with psql and Node certificate verification. Render provider role has CREATEDB and CREATEROLE, without superuser. Temporary diagnostic rules were removed and cleanup verified.

Live verification, 2026-09-14: existing admin setup and migration completed successfully after correcting the provider ownership statement to `OWNER TO nap_admin`. Migration published and read back the internal admin connection and merged recovery state. Database status is available, saved stage is migrated, external allowlist is empty, and no cleanup intent remains. Root credentials were supplied privately and bootstrap succeeded. Live verification found one active root, one ready membership and one operator-bootstrap intent; the configured password verified. A bootstrap rerun preserved the root ID and password hash. Setup and migration reruns also succeeded without regressing the migrated stage. There are zero registered production cells. Live cell seeding remains unverified pending approval for shipping/deployment and the first paid cell; no additional paid resources or deployments were performed. The local change passed 524 tests, lint, typecheck, build, formatting, licenses, and diff checks.
