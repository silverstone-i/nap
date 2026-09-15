# Documentation consistency implementation plan

Design: Accepted by owner, 2026-09-15. Implementation: Implemented and validated locally; not shipped.

## Outcome and baseline

Resolve the 23 reviewed findings without changing runtime behavior, API contracts,
seed data, migrations, credentials, or deployed resources. The owner selected
architecture amendments for existing provisioning behavior. ADR 0016 records them.

The working tree was clean at `cbf1aaa3` before this task. Node is 24.19.0.
The findings were rechecked against that checkout. Existing architecture tests
scan only TypeScript; the provisioning engine imports two reference-seed functions.
Historical implementation plans retain their original evidence.

## Correction checklist

Each row names the owning area and the references to reconcile. A checked row
requires the verification described in its last column.

| Done | ID  | Finding and owner                               | Correction and affected references                                                   | Verification                                       |
| ---- | --- | ----------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| [x]  | 01  | Readiness: specification                        | Align README and code-documentation example with admin readiness and live cell pools | Compare runtime and cell registry                  |
| [x]  | 02  | Descriptor: specification                       | Include entitlement and reconcile RBAC text                                          | Compare descriptor type and registries             |
| [x]  | 03  | Language: specification                         | Limit JavaScript exception to four provisioning files; update RULES and ADR          | Language guard and negative fixtures               |
| [x]  | 04  | Imports: specification                          | Allow only engine imports of seedReference/referenceReady; update conformance        | Multi-language import tests                        |
| [x]  | 05  | Module layout: specification                    | Use repositories.ts and conditional folders/barrels                                  | Compare production module files                    |
| [x]  | 06  | Bulk selection: shell PRD                       | Document existing management selection and actions                                   | Compare ManagementPage                             |
| [x]  | 07  | Retries: operational standards                  | Distinguish bounded polling from operation retries; correct README                   | Compare Render polling and maintenance loops       |
| [x]  | 08  | Redis: ARCH-029                                 | Correct README summary                                                               | Compare cachedLookup and sessions                  |
| [x]  | 09  | Reference status: reference PRD                 | Record shipped subset, separate live evidence                                        | Git merge and release evidence                     |
| [x]  | 10  | Setup: contributor guide                        | Link current setup guides                                                            | Resolve links and instructions                     |
| [x]  | 11  | Render preparation: delivery plan               | Label former gap as completed preparation                                            | Compare static serving and Blueprint               |
| [x]  | 12  | Restart evidence: Render plan                   | Link latest dated verification record                                                | Preserve fresh-fork and tenant acceptance limits   |
| [x]  | 13  | Tables: affected PRDs                           | Restore detached revision rows                                                       | Parser fixtures and rendered tables                |
| [x]  | 14  | Procedure: production guide                     | Split ordinary-tenant acceptance into numbered steps                                 | Compare every original action and condition        |
| [x]  | 15  | Dense requirements: shell/tenancy/specification | Separate independent requirements without changing meaning                           | Editorial comparison and preserved requirement IDs |
| [x]  | 16  | Status wording: settings/RBAC                   | Remove obsolete draft wording                                                        | Search current accepted sections                   |
| [x]  | 17  | Heading hierarchy: README                       | Make operations peer sections                                                        | Render heading outline                             |
| [x]  | 18  | Index: documentation index                      | Separate plans and include reference PRD                                             | PRD inventory check                                |
| [x]  | 19  | Current requirements: specification/PRDs        | Consolidate subject sections and separate history                                    | Preserve anchors, IDs and historical evidence      |
| [x]  | 20  | Placement/workflow: index/specification         | Move plan policy to workflow and update incoming links                               | Cross-document references                          |
| [x]  | 21  | Duplicate PRD: reference PRD                    | Rename to 0010; preserve scope-record PRD 0008                                       | Unique IDs and all incoming references             |
| [x]  | 22  | Deleted evidence path: shell PRD                | Point to current management implementation                                           | Inline-path check                                  |
| [x]  | 23  | Seed provenance: seed README                    | Pin source commits matching recorded hashes                                          | Download hashes; no dataset changes                |

## Delivery and recovery

Amend the specification first, record ADR 0016, correct owning documents and
references, then extend existing test infrastructure. No new package is needed.
Run focused checks before the full repository validation. Reverting this local
change restores documentation and checks only; no database recovery is needed.

## Verification evidence

The 23 original corrections and finding 24 are implemented locally. No runtime
source, seed dataset, license, migration, or configuration file changed.

### Resolved finding 24: shared contract placement

The owner approved retaining the existing shared contract layout on 2026-09-15.
The specification's [Shared package boundary](../specs/nap-platform-specification.md#shared-package-boundary)
now describes contracts in `transport/` and the direct root export of control
contracts. ADR 0016 records the rationale. The original shared-transport delivery
plan remains historical evidence and links to the current contract. Public
exports and endpoint ownership are unchanged. All focused and repository checks
pass after this amendment.

### Local checks on 2026-09-15

- Architecture checks: all five pass, including approved imports, rejected
  import variants, all runtime extensions, and the four-file language limit.
- Documentation checks: all seven pass, including the complete corpus check.
  ADR titles, statuses and requirements match the index. Every ADR index entry
  must be in a parsed table row. PRD identifiers are unique and indexed.
- Final `npm test`: all 548 tests pass (115 toolchain, 340 API, 79 web,
  and 14 shared). Finding 24 no longer fails the corpus check.
- Workspace suites run separately: API 340, web 79 and shared 14 tests pass.
  The first API run returned 401 instead of 404 in an archived-record assertion.
  Its nine-test file passed in isolation, then the entire API suite passed.
  No code was changed to hide the failure; its cause is not established.
- `git diff --check` passes.
- `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build`,
  and `npm run licenses` pass. The license check covers 228 package records.
- Parsed and rendered all 29 affected Markdown files, including 43 tables.
  Inspected revision-table rendering, the numbered production procedure,
  and README heading levels in the browser. Index tables and metadata passed
  local parser checks; automatic approval review blocked their final browser
  inspection because it considered localhost repository content sensitive.
- Compared original headings, permanent requirement IDs and dated revision rows
  with the edited files: none were lost. The renamed Render preparation section
  retains an explicit anchor for incoming links.
- Local links and anchors, obsolete reference-PRD paths, and current inline code
  paths were checked separately. No unresolved path findings remain.

### External evidence

PR 24 merged on 2026-09-13 at 20:48:59 UTC, commit
`b1324ca0e4e2ed6d0047a2b084176b3e8b91a0dd`. GitHub release metadata records
v0.17.0 publication at 20:51:45 UTC. This supports the reference-data shipment;
it does not establish new production acceptance.

Both pinned source files were downloaded through GitHub's read-only content API.
Their SHA-256 hashes exactly match the previously recorded values in the
[seed README](../../apps/api/src/modules/reference-data/seeds/README.md).
The browser lookup could not retrieve the pinned GitHub pages; the successful
API downloads establish their existence and content, so they are not recorded
as broken links.

Render's official restart, Blueprint lifecycle, API authentication and service
creation references were reviewed. The updated Render plan points to the
existing dated production verification record. No new deployment test occurred.
Historical CI and live acceptance records remain historical evidence.

The implementation request excluded shipping. The subsequent owner instruction
`/ship pr with release:patch` authorizes a signed-off commit, push and labeled PR.
It does not authorize a merge, deployment or new live acceptance.

## CI checkout correction

The first PR check failed because the inline-path test relied on files present
only in the developer checkout. Environment and provisioning-state files are
intentionally ignored and absent in CI. The check now uses Git's tracked path
inventory and an exact list of documented setup/build outputs. It does not
exempt arbitrary ignored files or misspelled output paths.

The original test fails in a clean temporary clone; the corrected seven-test
documentation suite passes there without environment files or build output.
Regression coverage still rejects misspelled setup paths and missing source
files. No local configuration or credentials were copied into the clone.

After the correction, all 548 tests pass locally. Lint, formatting and
`git diff --check` also pass.
