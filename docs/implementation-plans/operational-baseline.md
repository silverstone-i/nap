# Operational baseline implementation plan

## Work checklist

- [x] Record the approved logging clarification in the specification and ADR 0003.
- [x] Add minimal shared error and health contracts.
- [x] Implement request correlation, safe logging, and HTTP error mapping.
- [x] Implement bounded readiness and graceful shutdown.
- [x] Verify behavior and reconcile documentation.

## Outcome and accepted design

Implement `ARCH-045`, the required portion of `ARCH-043`, and the existing
runtime-role checks from the [specification](../specs/nap-platform-specification.md#operational-standards).
This specification-owned capability needs no component PRD. ADR 0002 governs
this filename; ADR 0003 records the approved log-safety clarification.

## Work and PR sequence

One coherent implementation PR. Preserve composition roots and import layers.
Amend the specification first, record ADR 0003, then implement contracts,
request boundaries, lifecycle, tests, and documentation. Commit, push, PR
creation, and merge require separate authorization.

Shared transport gains the version-1 error schema, stable error-code registry,
and health success schema. Broader transport/client validation stays with the
later roadmap capability. Add correlated JSON responses for health and errors,
a 100 KiB JSON limit, and refusal of compressed bodies. App construction remains
free of connection/listener effects; readiness is an explicit callback.

Use AsyncLocalStorage for validated UUID request IDs. A single Pino logger
emits safe fields to stdout without hostname, raw URLs, payloads, configuration,
or arbitrary error objects. Both database adapters discard metadata and select
safe messages before logging. The request boundary logs failures once.

Check both runtime roles before listening and freshly on readiness requests.
Coalesce overlapping probes, cap each cycle at five seconds, destroy timed-out
probe connections, and retain an expired cycle until pending work settles.
Shutdown marks unready, drains HTTP for ten seconds, then allows five seconds
for pool cleanup. Deadline/cleanup failures exit unsuccessfully. Repeated
signals share shutdown; interrupted startup cannot later open a listener.

## Verification and evidence

Test UUID validation, duplicate headers, concurrent context isolation, safe
schema-valid HTTP responses, malformed/oversized/compressed bodies, seeded-secret
log exclusion, single failure logging, fresh and coalesced readiness, timeout
cleanup, unsafe roles, partial startup, listener failures, graceful draining,
forced shutdown, and pool cleanup failures. Run existing database/isolation
regressions with disposable PostgreSQL fixtures. Run focused tests first, then
lint, typecheck, test, build, format:check, and licenses on the pinned Node.
The roadmap records actual evidence; Verified requires merged passing delivery.

## Local verification evidence

On 2026-09-06, Node 24.19.0 passed lint, typecheck, all 106 tests (15 toolchain,
88 API, 1 web, 2 shared), build, format:check, and the production license check
(220 package records). Focused tests exposed and verified fixes for keep-alive
drain cleanup and server-side query deadlines after client disconnect. Real
PostgreSQL fixtures verify role changes, timeout cleanup, and isolation.
Commit, push, PR creation, merge, and CI verification remain pending.

## Defaults, rollout, and recovery

No automatic retries, metrics exporter, sampling policy, monitoring vendor,
business routes, authentication, or web changes. These remain deferred rather
than claimed as implemented. Audit records remain independent of diagnostics.
No production migrations or credential changes. Deploy the API and configure
GET /health/live and GET /health/ready probes. Rollback restores the previous
artifact and probe configuration. Test fixtures alone own disposable resources.
