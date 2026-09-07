# Shared transport package implementation plan

## Features already implemented

Delivered by the operational baseline in
[PR #6](https://github.com/silverstone-i/nap/pull/6). This plan reuses them
and does not recreate them.

- `apiErrorCodes`, the registry of six stable error codes, and `ApiErrorCode`.
- `apiErrorSchema`, the strict failure envelope carrying `version`, `code`,
  `message`, and `fieldErrors` only with `INVALID_INPUT`, and `ApiError`.
- `healthResponseSchema` and `HealthResponse` for the two health probes.
- The `transport/` barrel and the root `index.ts` with one line per folder.
- The API boundary error handler that writes the failure envelope, and the
  bounded JSON body parser that refuses oversized and compressed bodies.
- The toolchain boundary test that forbids deep `@nap/shared` imports and any
  `@nap/*` dependency inside `packages/shared`.

## Work checklist

- [x] Amend the specification's shared package boundary and add a revision.
- [x] Add the transport envelopes and refactor health and error schemas to them.
- [x] Add API request-body validation and the response-contract helper.
- [x] Add the validating web API client and its test configuration.
- [x] Verify, then reconcile the roadmap, changelog, and this plan.

## Outcome and accepted design

Implement the remainder of `ARCH-043` from the
[specification](../specs/nap-platform-specification.md#arch-043--shared-transport-boundary):
the success and list envelopes the
[framework HTTP contract](../specs/nap-platform-specification.md#framework-http-contract)
requires, request and response validation at the API transport boundary, and
response validation in the web client as the
[operational standards](../specs/nap-platform-specification.md#operational-standards)
describe. This is specification-owned architecture and needs no component PRD.
ADR 0002 governs this filename. No new ADR is needed: the envelope's fields were
recorded in the specification on 2026-09-04, and naming the `page` fields is a
specification amendment, not a changed decision.

## Work and PR sequence

One coherent implementation PR. Amend the specification first, then the shared
package, the API, the web client, tests, and documentation. Commit, push, PR
creation, and merge require separate authorization.

The shared package gains `transport/envelopes.ts`: the `transportVersion`
constant, `successResponseSchema` and `listResponseSchema` factories over the
schema of the value they carry, and `pageSchema` with `size`, `total`, and an
optional `cursor`. The health schema becomes a `successResponseSchema` call and
the error schema reads its version from the constant. Response schemas do not
coerce; a server that emits the wrong type has a defect.

The API gains `validateBody(schema)` middleware that replaces the request body
with the checked value or passes `INVALID_INPUT` with per-field messages keyed
by dotted path, and `sendContract(response, schema, value, status)` that checks
an outgoing body and throws on violation so the error handler answers with the
generic `INTERNAL_ERROR` envelope. The health routes use `sendContract`. The
error handler keeps its own parse because a throw there would let Express's
final handler write HTML.

The web client gains `api/request.ts` with `requestContract(path, schema,
init)`. It sends a same-origin request, keeps the echoed `X-Request-ID`,
validates a 2xx body against the given schema and any other body against
`apiErrorSchema`, and returns a discriminated result. A body that fails its
schema or cannot be read becomes `UNREADABLE_RESPONSE`; an unreachable server
becomes `NETWORK_FAILURE`; both carry fixed messages. `zod` becomes a direct
web dependency, and the web test configuration accepts `.ts` test files.

Deferred to Framework HTTP surface: list request parameters — page size,
continuation cursor, soft-deletion selector, and sort — because that capability
owns list parameter parsing and the sort syntax is not designed. No production
route uses `validateBody` and no screen uses `requestContract` until the
authentication capability; the specification forbids mock-backed screens.

## Verification and evidence

Shared tests prove the envelopes accept valid bodies and reject a wrong
version, extra fields at every level, negative or fractional totals, a zero
size, and an empty or null cursor, and pin the inferred types. API tests drive
`validateBody` and `sendContract` through the real body parser and error
handler with supertest, asserting dotted field keys, one envelope per refusal,
and that submitted values and contract detail never reach the client. Web tests
stub `fetch` and cover success, error envelopes with field errors, a success
body failing its schema, unreadable JSON, a non-envelope error body, and a
rejected fetch. The boundary test is unchanged and remains evidence. Run
focused tests first, then lint, typecheck, test, build, format:check, and
licenses on the pinned Node. The roadmap records actual evidence; Verified
requires merged passing delivery.

## Local verification evidence

On 2026-09-07, Node 24.19.0 passed lint, typecheck, all 118 tests (15
toolchain, 93 API, 5 web, 5 shared), build, format:check, and the production
license check (220 package records). The API integration tests ran against
disposable PostgreSQL 18 fixtures, which need a locale in the environment.

## Merge and CI evidence

[PR #8](https://github.com/silverstone-i/nap/pull/8) merged on 2026-09-07 with
the `changelog`, `checks`, and `release` workflows passing. On 2026-09-07 the
package import boundary gained a test and every repository check was re-run on
`main`; the roadmap records the result.

## Defaults, rollout, and recovery

No migrations, credential changes, new routes, or changes to what existing
endpoints answer. Health responses are byte-identical. Deploy the API and web
artifacts as usual; rollback restores the previous artifacts. No feature gates
or ordered release units.
