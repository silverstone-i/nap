# CLAUDE.md

Guidance for coding agents and contributors working in the NAP repository.

## Start here

Before planning or changing code, follow the reading order in the
[documentation index](docs/README.md). In particular:

1. Read the [platform specification](docs/specs/nap-platform-specification.md).
   It owns the platform requirements, the technology stack, and the repository
   structure — file, import, module-ownership, and deployment placement.
2. Read the relevant component PRD. If it does not exist, create and accept it
   before implementing the component.
3. Read every applicable ADR in `docs/ADRs/`, starting from its
   [index](docs/ADRs/INDEX.md).
4. Read every applicable convention in `docs/RULES/`. None exists yet: until a
   subject has its own RULES file, the specification section that owns that
   subject governs.

Do not treat the roadmap or `docs/reference/` as architectural authority. Do
not copy a requirement into a second document; link its stable ID instead.

An instruction to implement X means X ships in that task. When the
specification's [documentation placement](docs/specs/nap-platform-specification.md#documentation-placement) section
requires an implementation plan, write it as the first step and then execute it
to completion in the same task; never deliver the plan, or one slice of it, in
place of X. If X must be split across pull requests, ask before writing
anything. The roadmap owns current
implementation status, and GitHub owns merge and CI evidence.

## The specification is the root

- The [platform specification](docs/specs/nap-platform-specification.md)
  governs. Every feature PRD, ADR, and RULES document derives from it and
  cites the `ARCH-*` requirements it implements. It is amended when
  implementation shows the architecture is wrong; a session that declares it
  immutable means you do not propose changes in that session, never that it
  cannot evolve.
- The specification owns what it describes. The technology stack, the database
  foundation, the import layers, the module shape, the descriptor, the
  framework HTTP contract, and the toolchain are specification architecture,
  not features waiting for a component PRD. Do not propose a component PRD for
  them and do not present one as a decision to make.
- The specification is amended before the work that depends on it. A conflict
  between the specification and what a PRD, an ADR, or an implementation
  requires stops the work: raise it and resolve it with the owner rather than
  deciding it in either direction.
- An ADR or RULES document is not orphaned because its feature is unbuilt. Its
  parent is the requirement it cites, and it is consumed when that feature's
  PRD is written. It needs nothing until then.
- A review reports a defect only where a current document cites a superseded
  ADR, or where code does not match the rules it derives from. The roadmap
  tracks the latter; do not reopen it as a finding.
- Moving forward means building the next feature from the specification: its
  PRD, only the ADRs and RULES that feature actually requires, then code, then
  a specification amendment if implementation proves the architecture wrong. No
  audits, closure plans, or retroactive documents.

## Technology and architecture decisions

The specification's technology stack section owns what may be depended on, one
choice per role, and its database, tenant-isolation, and framework sections own
topology, isolation, and the module HTTP surface. Package manifests, the
lockfile, `.nvmrc`, and TypeScript configuration own the exact installed
versions and compiler settings. An ADR records a choice the specification
deliberately leaves open, or the rationale for amending it; it is not where a
platform technology is chosen.

Until a subject has its own RULES document, the specification section that
owns it governs.

- Database code follows
  [database composition roots](docs/specs/nap-platform-specification.md#database-composition-roots),
  the [tenant transaction contract](docs/specs/nap-platform-specification.md#tenant-transaction-contract),
  the [persistence mechanism](docs/specs/nap-platform-specification.md#persistence-mechanism), and
  [database record conventions](docs/specs/nap-platform-specification.md#database-record-conventions).
- Module models, controllers, and routers follow
  [module shape](docs/specs/nap-platform-specification.md#module-shape),
  [module authoring conventions](docs/specs/nap-platform-specification.md#module-authoring-conventions), and the
  [framework HTTP contract](docs/specs/nap-platform-specification.md#framework-http-contract).
- Web-shell code follows [web structure](docs/specs/nap-platform-specification.md#web-structure) and
  [web shared behavior](docs/specs/nap-platform-specification.md#web-shared-behavior).
- A PRD carries the permanent requirement identifiers described in
  [how this specification is used](docs/specs/nap-platform-specification.md#how-this-specification-is-used) and the
  two statuses in the [documentation index](docs/README.md#status-model).
- Design and implementation work follows the
  [change workflow](docs/README.md#change-workflow), and the triggers requiring
  an implementation plan are in
  [documentation placement](docs/specs/nap-platform-specification.md#documentation-placement).
- Release, versioning, and dependency-licensing work follows
  [Commit and release operations](#commit-and-release-operations) below.

If a requested change conflicts with an accepted decision, do not silently
work around it. Stop and raise it. Once resolved, amend the specification
first, then update every affected current PRD, RULES file, ADR index entry, and
roadmap dependency in the same change.

## Repository checks

Run checks from the repository root using the Node version pinned by `.nvmrc`:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run format:check`
- `npm run licenses`

The API development loop is `npm run dev:api`; the web development server is
`npm run dev:web`. The web development server does not replace the typecheck.
All applicable checks must pass before a push.

## Documentation changes

- Update the current owning document; do not create parallel architecture
  summaries.
- A decision change requires an ADR. A platform requirement, layout,
  ownership, or stack change requires the specification to change. A component
  requirement change requires its owning PRD to change. An implementation
  convention change requires its scoped RULES document to change.
- Component table definitions become authoritative only in accepted component
  PRDs and module-owned migrations. The initial table schema in
  `docs/reference/` is planning input.
- A feature PRD never refines the architecture on its own. The specification
  is amended first, and the PRD is written against the amended text. Code that
  drifts from the specification with nothing saying so is a defect in the code.
- Append the required revision entry when changing the specification or a PRD.
- Keep design and implementation status separate. Merged code and migrations
  own actual implemented state; accepted PRDs own intended behavior, and the
  final capability pull request reconciles them before marking it verified.

## Commit and release operations

The release contract is enforced by `.github/workflows/release-on-merge.yml`
and `.github/workflows/changelog-check.yml`. Its conventions are the ones below
until the release-operations PRD and RULES document are written with that
capability:

- Sign every commit using `git commit -s`.
- Branch as `feat/`, `fix/`, `docs/`, or `chore/`; keep a pull request to one
  concern. `main` is the only long-lived branch and is never pushed directly.
- A releasing pull request carries exactly one `release:patch`,
  `release:minor`, or `release:major` label and adds its entries under
  `## [Unreleased]` in `CHANGELOG.md`.
- CI owns version changes, changelog promotion, tags, and GitHub Releases. Do
  not perform those operations manually.
- Copilot re-reviews a pull request on every push; do not re-request a review
  by hand.
- Review feedback that contradicts a decision already made, in a commit
  message, an instruction, or an accepted document, is declined with that
  rationale. Reopening it requires the owner's current instruction.

## Licensing

NAP is licensed AGPL-3.0-or-later. Every `.ts`, `.tsx`, `.js`, and `.mjs`
file carries this header, with comment syntax adjusted to the language, as
`eslint.config.mjs` does. Markdown, JSON, and YAML files do not.

```text
Copyright (c) 2026–present NapSoft, LLC.
SPDX-License-Identifier: AGPL-3.0-or-later
```

Production dependencies must carry a license listed in
`.licenses-allowed.json`; adding one requires justification in the same pull
request.

## Security

Do not open a public issue for a vulnerability. Use a private GitHub security
advisory or email `ian@isilverstone.com`.
